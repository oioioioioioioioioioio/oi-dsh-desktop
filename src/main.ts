import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron/main'
import { shell } from 'electron'
import { loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {
  DesktopClientModuleRegistry,
  DesktopConnectionService,
} from 'oi-dsh-desktop-bundle'
import { parseDesktopArgs } from './args.js'
import { DesktopIpcController } from './desktop-ipc.js'
import { createElectronNativeHost } from './native-host.js'
import { packageRoot } from './package-meta.js'
import { bootDesktopProfile } from './profile.js'
import {
  DESKTOP_APP_URL,
  createDesktopProtocolHandler,
  isDesktopAppUrl,
} from './protocol.js'
import { assertCompatibleHarness, resolvePackageRuntime } from './runtime.js'
import { exportSessionToFile } from './session-export.js'

const NAME = 'oi-dsh-desktop'

protocol.registerSchemesAsPrivileged([{
  scheme: 'dsh',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true,
  },
}])

async function start(): Promise<void> {
  const options = parseDesktopArgs(process.argv.slice(2))
  if (options.dshHome !== undefined) process.env.DSH_HOME = options.dshHome
  const dsh = resolvePackageRuntime('@deepseek-ai/dsh')
  const bundle = resolvePackageRuntime('oi-dsh-desktop-bundle')
  assertCompatibleHarness(dsh.version, options.allowUnsupportedHarness)

  app.setName('DeepSeek Harness')
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  await app.whenReady()

  const environment = loadLayeredEnv(NAME)
  const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
  const ctx = await bootDesktopProfile({
    profile: options.profile,
    ...(options.dshHome === undefined ? {} : { dshHome: options.dshHome }),
    environment,
    installAnchor,
    dshRuntime: dsh,
    bundleRuntime: bundle,
    nativeHost: createElectronNativeHost(),
  })
  const connection = ctx.get('connection') as DesktopConnectionService | undefined
  const clientModules = ctx.get('clientModules') as DesktopClientModuleRegistry | undefined
  const api = ctx.get('apiProxy') as ApiProxy | undefined
  if (connection === undefined || clientModules === undefined || api === undefined) {
    await ctx.fiber.dispose()
    throw new Error('desktop profile did not provide connection, clientModules, and apiProxy')
  }
  if (process.env.OI_DSH_DEBUG_GRAPH === '1') {
    process.stderr.write(`${NAME}: boot graph ${JSON.stringify(clientModules.graph())}\n`)
  }

  const require = createRequire(import.meta.url)
  const distIndex = require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html')
  const assetsDir = join(packageRoot(), 'assets')
  await protocol.handle('dsh', createDesktopProtocolHandler({ distIndex, assetsDir, clientModules }))

  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 860,
    minHeight: 580,
    show: false,
    frame: false,
    thickFrame: true,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness',
    icon: join(assetsDir, 'logo.jpg'),
    backgroundColor: '#f7f8fa',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  })
  window.setMenuBarVisibility(false)

  const desktopIpc = new DesktopIpcController(
    ipcMain,
    window,
    connection,
    api,
    (sessionId, signal) => exportSessionToFile(window, api, sessionId, signal),
  )

  const session = window.webContents.session
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })
  window.webContents.on('will-attach-webview', event => { event.preventDefault() })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//u.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isDesktopAppUrl(url)) return
    event.preventDefault()
    if (/^https?:\/\//u.test(url)) void shell.openExternal(url)
  })
  window.once('ready-to-show', () => { window.show() })
  window.webContents.once('dom-ready', () => { window.show() })
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) process.stderr.write(`${NAME}: renderer load failed (${String(code)} ${description}): ${url}\n`)
  })
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 || process.env.OI_DSH_DEBUG_GRAPH === '1') {
      process.stderr.write(`${NAME}: renderer console level ${String(level)}: ${message}\n`)
    }
  })

  let disposing: Promise<void> | undefined
  let allowClose = false
  const dispose = (): Promise<void> => {
    disposing ??= (async () => {
      await desktopIpc.dispose()
      await ctx.fiber.dispose()
      protocol.unhandle('dsh')
      allowClose = true
      if (!window.isDestroyed()) window.destroy()
      app.quit()
    })()
    return disposing
  }
  window.on('close', event => {
    if (allowClose) return
    event.preventDefault()
    void dispose()
  })
  app.on('before-quit', event => {
    if (allowClose) return
    event.preventDefault()
    void dispose()
  })
  app.on('second-instance', () => {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  window.webContents.on('render-process-gone', () => { void dispose() })

  try {
    await window.loadURL(DESKTOP_APP_URL)
    if (options.devtools) window.webContents.openDevTools({ mode: 'detach' })
  } catch (error) {
    await dispose()
    throw error
  }
}

function formatStartupError(error: unknown): string {
  const seen = new Set<unknown>()
  const lines: string[] = []
  const visit = (value: unknown, label: string, indent: string): void => {
    if (seen.has(value)) {
      lines.push(`${indent}${label}[circular error]`)
      return
    }
    if (typeof value === 'object' && value !== null) seen.add(value)
    const detail = value instanceof Error ? value.stack ?? value.message : String(value)
    lines.push(`${indent}${label}${detail}`)
    if (value instanceof AggregateError) {
      value.errors.forEach((child, index) => { visit(child, `errors[${String(index)}]: `, `${indent}  `) })
    }
    if (value instanceof Error && value.cause !== undefined) visit(value.cause, 'cause: ', `${indent}  `)
  }
  visit(error, '', '')
  return lines.join('\n')
}

void start().catch((error: unknown) => {
  const message = formatStartupError(error)
  process.stderr.write(`${NAME}: ${message}\n`)
  if (app.isReady()) dialog.showErrorBox(`${NAME} failed to start`, message)
  app.exit(1)
})
