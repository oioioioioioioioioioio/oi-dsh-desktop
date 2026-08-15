export const DESKTOP_CHANNELS = {
  request: 'oi-dsh:request',
  cancelRequest: 'oi-dsh:request-cancel',
  openStream: 'oi-dsh:stream-open',
  closeStream: 'oi-dsh:stream-close',
  streamMessage: 'oi-dsh:stream-message',
  exportSession: 'oi-dsh:session-export',
  windowState: 'oi-dsh:window-state',
  windowMinimize: 'oi-dsh:window-minimize',
  windowToggleMaximize: 'oi-dsh:window-toggle-maximize',
  windowClose: 'oi-dsh:window-close',
  windowSystemMenu: 'oi-dsh:window-system-menu',
} as const
