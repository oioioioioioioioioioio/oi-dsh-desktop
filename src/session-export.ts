import { randomUUID } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import { sessionIdSchema } from '@deepseek-ai/dsh-host-apiproxy/api/sessions.schema'

export async function exportSessionToFile(
  window: BrowserWindow,
  api: Pick<ApiProxy, 'downloads'>,
  rawSessionId: unknown,
  signal: AbortSignal,
): Promise<{ canceled: boolean }> {
  const sessionId = sessionIdSchema.parse(rawSessionId)
  const selected = await dialog.showSaveDialog(window, {
    title: 'Export Session',
    defaultPath: `dsh-session-${sessionId.replace(/[^A-Za-z0-9_-]/g, '_')}.zip`,
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  })
  if (selected.canceled) return { canceled: true }
  signal.throwIfAborted()
  const response = await api.downloads.sessionLog({ sessionId, includeDescendants: true }, signal)
  if (!response.ok || response.body === null) {
    const detail = await response.text().catch(() => '')
    throw new Error(`session export failed: HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`)
  }
  await writeResponseAtomically(selected.filePath, response, signal)
  return { canceled: false }
}

async function writeResponseAtomically(
  target: string,
  response: Response,
  signal: AbortSignal,
): Promise<void> {
  if (response.body === null) throw new Error('session export response has no body')
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  let closed = false
  try {
    let position = 0
    for await (const chunk of response.body) {
      signal.throwIfAborted()
      let offset = 0
      while (offset < chunk.byteLength) {
        const result = await handle.write(chunk, offset, chunk.byteLength - offset, position)
        if (result.bytesWritten === 0) throw new Error('session export write made no progress')
        offset += result.bytesWritten
        position += result.bytesWritten
      }
    }
    await handle.sync()
    await handle.close()
    closed = true
    signal.throwIfAborted()
    await rename(temporary, target)
  } catch (error) {
    if (!closed) await handle.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}
