import { randomUUID } from 'node:crypto'
import type {
  BrowserWindow,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContents,
  WebFrameMain,
} from 'electron'
import { Menu } from 'electron'
import type {
  DesktopConnectionService,
  DesktopRequest,
  DesktopResponse,
  DesktopStreamMessage,
  DesktopWindowState,
} from 'oi-dsh-desktop-bundle'
import type { ApiProxy, HostFrame, MuxFrame, RpcRequest, ServerRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { DESKTOP_CHANNELS } from './channels.js'

type DesktopEvent = IpcMainEvent | IpcMainInvokeEvent
type StreamKind = 'mux' | 'host'
type StreamFrame = MuxFrame | HostFrame

const MAX_REQUEST_BODY_BYTES = 160 * 1024 * 1024
const MAX_PATH_CODE_UNITS = 16 * 1024
const MAX_HEADER_COUNT = 256
const MAX_ID_CODE_UNITS = 256

interface StreamRecord {
  readonly abort: AbortController
  done: Promise<void>
}

export type SessionExporter = (
  sessionId: unknown,
  signal: AbortSignal,
) => Promise<{ canceled: boolean }>

export class DesktopIpcController {
  private readonly requests = new Map<string, AbortController>()
  private readonly requestRuns = new Set<Promise<unknown>>()
  private readonly streams = new Map<string, StreamRecord>()
  private readonly streamRuns = new Set<Promise<void>>()
  private readonly exports = new Set<{ abort: AbortController; done: Promise<unknown> }>()
  private disposed = false

  constructor(
    private readonly ipc: Pick<IpcMain, 'handle' | 'on' | 'removeHandler' | 'removeListener'>,
    private readonly window: BrowserWindow,
    private readonly connection: Pick<DesktopConnectionService, 'fetch'>,
    private readonly api: ApiProxy,
    private readonly exportSession: SessionExporter,
  ) {
    ipc.handle(DESKTOP_CHANNELS.request, (event, id, request) => {
      this.assertTrustedSender(event)
      this.assertActive()
      return this.handleRequest(id, request)
    })
    ipc.handle(DESKTOP_CHANNELS.openStream, (event, id, kind) => {
      this.assertTrustedSender(event)
      this.assertActive()
      this.openStream(id, kind)
    })
    ipc.handle(DESKTOP_CHANNELS.exportSession, (event, sessionId) => {
      this.assertTrustedSender(event)
      this.assertActive()
      return this.handleExport(sessionId)
    })
    ipc.handle(DESKTOP_CHANNELS.windowState, event => {
      this.assertTrustedSender(event)
      this.assertActive()
      return this.windowState()
    })
    ipc.on(DESKTOP_CHANNELS.cancelRequest, this.cancelRequest)
    ipc.on(DESKTOP_CHANNELS.closeStream, this.closeStream)
    ipc.on(DESKTOP_CHANNELS.windowMinimize, this.minimizeWindow)
    ipc.on(DESKTOP_CHANNELS.windowToggleMaximize, this.toggleMaximizeWindow)
    ipc.on(DESKTOP_CHANNELS.windowClose, this.closeWindow)
    ipc.on(DESKTOP_CHANNELS.windowSystemMenu, this.showSystemMenu)
    this.window.on('maximize', this.publishWindowState)
    this.window.on('unmaximize', this.publishWindowState)
    this.window.on('enter-full-screen', this.publishWindowState)
    this.window.on('leave-full-screen', this.publishWindowState)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const channel of [
      DESKTOP_CHANNELS.request,
      DESKTOP_CHANNELS.openStream,
      DESKTOP_CHANNELS.exportSession,
      DESKTOP_CHANNELS.windowState,
    ]) this.ipc.removeHandler(channel)
    this.ipc.removeListener(DESKTOP_CHANNELS.cancelRequest, this.cancelRequest)
    this.ipc.removeListener(DESKTOP_CHANNELS.closeStream, this.closeStream)
    this.ipc.removeListener(DESKTOP_CHANNELS.windowMinimize, this.minimizeWindow)
    this.ipc.removeListener(DESKTOP_CHANNELS.windowToggleMaximize, this.toggleMaximizeWindow)
    this.ipc.removeListener(DESKTOP_CHANNELS.windowClose, this.closeWindow)
    this.ipc.removeListener(DESKTOP_CHANNELS.windowSystemMenu, this.showSystemMenu)
    this.window.removeListener('maximize', this.publishWindowState)
    this.window.removeListener('unmaximize', this.publishWindowState)
    this.window.removeListener('enter-full-screen', this.publishWindowState)
    this.window.removeListener('leave-full-screen', this.publishWindowState)
    for (const abort of this.requests.values()) abort.abort()
    for (const stream of this.streams.values()) stream.abort.abort()
    for (const operation of this.exports) operation.abort.abort()
    await Promise.allSettled([
      ...this.requestRuns,
      ...this.streamRuns,
      ...[...this.exports].map(operation => operation.done),
    ])
  }

  private readonly cancelRequest = (event: IpcMainEvent, rawId: unknown): void => {
    if (!this.isTrustedSender(event)) return
    const id = optionalId(rawId)
    if (id !== undefined) this.requests.get(id)?.abort()
  }

  private readonly closeStream = (event: IpcMainEvent, rawId: unknown): void => {
    if (!this.isTrustedSender(event)) return
    const id = optionalId(rawId)
    if (id !== undefined) this.streams.get(id)?.abort.abort()
  }

  private readonly minimizeWindow = (event: IpcMainEvent): void => {
    if (this.isTrustedSender(event)) this.window.minimize()
  }

  private readonly toggleMaximizeWindow = (event: IpcMainEvent): void => {
    if (!this.isTrustedSender(event)) return
    if (this.window.isMaximized()) this.window.unmaximize()
    else this.window.maximize()
  }

  private readonly closeWindow = (event: IpcMainEvent): void => {
    if (this.isTrustedSender(event)) this.window.close()
  }

  private readonly showSystemMenu = (event: IpcMainEvent, rawPoint: unknown): void => {
    if (!this.isTrustedSender(event)) return
    const point = menuPoint(rawPoint)
    if (point === undefined) return
    const menu = Menu.buildFromTemplate([
      { label: 'Restore', enabled: this.window.isMaximized(), click: () => { this.window.restore() } },
      { label: 'Minimize', click: () => { this.window.minimize() } },
      { label: 'Maximize', enabled: !this.window.isMaximized(), click: () => { this.window.maximize() } },
      { type: 'separator' },
      { label: 'Close', click: () => { this.window.close() } },
    ])
    menu.popup({ window: this.window, x: point.x, y: point.y })
  }

  private readonly publishWindowState = (): void => {
    this.sendRenderer(DESKTOP_CHANNELS.windowState, this.windowState())
  }

  private async handleRequest(rawId: unknown, rawRequest: unknown): Promise<DesktopResponse> {
    const id = parseId(rawId)
    if (this.requests.has(id)) throw new Error(`desktop IPC request ${JSON.stringify(id)} is already active`)
    const request = parseDesktopRequest(rawRequest)
    const abort = new AbortController()
    this.requests.set(id, abort)
    const run = this.dispatchRequest(request, abort.signal)
    this.requestRuns.add(run)
    try {
      return await run
    } finally {
      if (this.requests.get(id) === abort) this.requests.delete(id)
      this.requestRuns.delete(run)
    }
  }

  private async dispatchRequest(request: DesktopRequest, signal: AbortSignal): Promise<DesktopResponse> {
    const headers = new Headers(request.headers)
    headers.set('host', '127.0.0.1')
    headers.delete('origin')
    headers.delete('content-length')
    const response = await this.connection.fetch(new Request(internalUrl(request.path), {
      method: request.method,
      headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      signal,
    }))
    return {
      status: response.status,
      headers: [...response.headers.entries()],
      body: await response.text(),
    }
  }

  private openStream(rawId: unknown, rawKind: unknown): void {
    const id = parseId(rawId)
    const kind = parseStreamKind(rawKind)
    if (this.streams.has(id)) throw new Error(`desktop IPC stream ${JSON.stringify(id)} is already active`)
    const abort = new AbortController()
    const record: StreamRecord = { abort, done: Promise.resolve() }
    this.streams.set(id, record)
    this.send({ id, type: 'open' })
    const done = this.pumpStream(id, kind, abort).finally(() => {
      if (this.streams.get(id) === record) this.streams.delete(id)
      this.streamRuns.delete(done)
    })
    record.done = done
    this.streamRuns.add(done)
  }

  private async pumpStream(id: string, kind: StreamKind, abort: AbortController): Promise<void> {
    try {
      const stream = kind === 'mux'
        ? this.api.events.mux({ rpcId: RpcId(randomUUID()), payload: {} }, abort.signal)
        : this.api.events.host({ rpcId: RpcId(randomUUID()), payload: {} }, abort.signal)
      for await (const frame of stream) {
        if (abort.signal.aborted) break
        this.send({ id, type: 'frame', frame: serverRequest(frame) })
      }
      if (!abort.signal.aborted) this.send({ id, type: 'end' })
    } catch (error) {
      if (!abort.signal.aborted) {
        this.send({ id, type: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      abort.abort()
    }
  }

  private handleExport(sessionId: unknown): Promise<{ canceled: boolean }> {
    const abort = new AbortController()
    const done = this.exportSession(sessionId, abort.signal)
    const operation = { abort, done }
    this.exports.add(operation)
    void done.finally(() => { this.exports.delete(operation) }).catch(() => {})
    return done
  }

  private send(message: DesktopStreamMessage): void {
    this.sendRenderer(DESKTOP_CHANNELS.streamMessage, message)
  }

  private sendRenderer(channel: string, value: unknown): void {
    if (this.window.webContents.isDestroyed()) return
    try {
      this.window.webContents.send(channel, value)
    } catch {
      // Window destruction can win the preceding check.
    }
  }

  private windowState(): DesktopWindowState {
    return { maximized: this.window.isMaximized(), fullScreen: this.window.isFullScreen() }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('desktop IPC is disposed')
  }

  private assertTrustedSender(event: DesktopEvent): void {
    if (!this.isTrustedSender(event)) throw new Error('desktop IPC rejected an untrusted sender')
  }

  private isTrustedSender(event: DesktopEvent): boolean {
    const contents = this.window.webContents
    const frame = event.senderFrame
    return !this.disposed
      && event.sender === contents
      && frame !== null
      && frame === contents.mainFrame
      && isDesktopFrame(frame, contents)
  }
}

function isDesktopFrame(frame: WebFrameMain, contents: WebContents): boolean {
  if (frame !== contents.mainFrame) return false
  try {
    const url = new URL(frame.url)
    return url.protocol === 'dsh:' && url.hostname === 'app'
      && url.username === '' && url.password === '' && url.port === ''
  } catch {
    return false
  }
}

function serverRequest(frame: RpcRequest<StreamFrame>): ServerRequest {
  return { type: 'server-request', rpcId: frame.rpcId, method: frame.payload.type, payload: frame.payload }
}

export function parseDesktopRequest(value: unknown): DesktopRequest {
  if (typeof value !== 'object' || value === null) throw new TypeError('desktop request must be an object')
  const record = value as Record<string, unknown>
  if (typeof record.path !== 'string' || record.path.length === 0 || record.path.length > MAX_PATH_CODE_UNITS) {
    throw new TypeError('desktop request path must be a non-empty bounded string')
  }
  internalUrl(record.path)
  if (record.method !== 'GET' && record.method !== 'HEAD' && record.method !== 'POST') {
    throw new TypeError('desktop request method must be GET, HEAD, or POST')
  }
  if (!Array.isArray(record.headers) || record.headers.length > MAX_HEADER_COUNT) {
    throw new TypeError('desktop request headers must be a bounded array')
  }
  const headers: Array<[string, string]> = record.headers.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') {
      throw new TypeError('desktop request header must be a string pair')
    }
    return [pair[0], pair[1]]
  })
  if (record.body !== undefined && typeof record.body !== 'string') {
    throw new TypeError('desktop request body must be a string')
  }
  if (typeof record.body === 'string' && Buffer.byteLength(record.body) > MAX_REQUEST_BODY_BYTES) {
    throw new RangeError('desktop request body exceeds the carrier limit')
  }
  return {
    path: record.path,
    method: record.method,
    headers,
    ...(record.body === undefined ? {} : { body: record.body }),
  }
}

function internalUrl(path: string): URL {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('#')) {
    throw new TypeError('desktop request path must be an absolute internal path without a fragment')
  }
  const url = new URL(path, 'http://dsh.internal')
  if (url.origin !== 'http://dsh.internal') throw new TypeError('desktop request escaped the internal Host')
  return url
}

function parseId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_CODE_UNITS) {
    throw new TypeError('desktop IPC id must be a non-empty bounded string')
  }
  return value
}

function optionalId(value: unknown): string | undefined {
  try {
    return parseId(value)
  } catch {
    return undefined
  }
}

function parseStreamKind(value: unknown): StreamKind {
  if (value === 'mux' || value === 'host') return value
  throw new TypeError('desktop IPC stream kind must be mux or host')
}

function menuPoint(value: unknown): { x: number; y: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const point = value as Record<string, unknown>
  if (typeof point.x !== 'number' || !Number.isFinite(point.x)
    || typeof point.y !== 'number' || !Number.isFinite(point.y)) return undefined
  return { x: Math.round(point.x), y: Math.round(point.y) }
}
