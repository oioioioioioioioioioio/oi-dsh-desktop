import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopBridge,
  DesktopRequest,
  DesktopResponse,
  DesktopStreamMessage,
  DesktopWindowState,
} from 'oi-dsh-desktop-bundle'
import { DESKTOP_CHANNELS } from './channels.js'

const bridge: DesktopBridge = {
  windowControls: {
    getState: () => ipcRenderer.invoke(DESKTOP_CHANNELS.windowState) as Promise<DesktopWindowState>,
    minimize: () => { ipcRenderer.send(DESKTOP_CHANNELS.windowMinimize) },
    toggleMaximize: () => { ipcRenderer.send(DESKTOP_CHANNELS.windowToggleMaximize) },
    close: () => { ipcRenderer.send(DESKTOP_CHANNELS.windowClose) },
    showSystemMenu: (x, y) => { ipcRenderer.send(DESKTOP_CHANNELS.windowSystemMenu, { x, y }) },
    onStateChange(listener) {
      const receive = (_event: Electron.IpcRendererEvent, state: DesktopWindowState): void => { listener(state) }
      ipcRenderer.on(DESKTOP_CHANNELS.windowState, receive)
      return () => { ipcRenderer.removeListener(DESKTOP_CHANNELS.windowState, receive) }
    },
  },
  request: (id: string, request: DesktopRequest) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.request, id, request) as Promise<DesktopResponse>,
  cancelRequest: id => { ipcRenderer.send(DESKTOP_CHANNELS.cancelRequest, id) },
  openStream: (id, kind) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.openStream, id, kind) as Promise<void>,
  closeStream: id => { ipcRenderer.send(DESKTOP_CHANNELS.closeStream, id) },
  onStreamMessage(listener) {
    const receive = (_event: Electron.IpcRendererEvent, message: DesktopStreamMessage): void => { listener(message) }
    ipcRenderer.on(DESKTOP_CHANNELS.streamMessage, receive)
    return () => { ipcRenderer.removeListener(DESKTOP_CHANNELS.streamMessage, receive) }
  },
  exportSession: sessionId =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.exportSession, sessionId) as Promise<{ canceled: boolean }>,
}

contextBridge.exposeInMainWorld('dshDesktop', bridge)
