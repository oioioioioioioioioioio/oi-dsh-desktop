import { BrowserWindow, dialog } from 'electron'
import type { DesktopNativeHost } from 'oi-dsh-desktop-bundle'

export function createElectronNativeHost(): DesktopNativeHost {
  return {
    async pickDirectory(signal): Promise<string | null> {
      signal.throwIfAborted()
      const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (owner === undefined || owner.isDestroyed()) {
        throw new Error('desktop directory picker: no active Electron window')
      }
      const result = await dialog.showOpenDialog(owner, {
        title: 'Select Workspace Directory',
        properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
      })
      signal.throwIfAborted()
      return result.canceled ? null : result.filePaths[0] ?? null
    },
  }
}
