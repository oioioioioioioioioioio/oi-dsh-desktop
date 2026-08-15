(() => {
  const api = window.dshDesktop?.windowControls
  if (!api || document.querySelector('[data-oi-titlebar]')) return
  const bar = document.createElement('header')
  bar.dataset.oiTitlebar = ''
  bar.innerHTML = [
    '<div data-oi-brand><img src="/logo.jpg" alt=""><span>DeepSeek Harness</span></div>',
    '<div data-oi-window-controls>',
    '<button type="button" data-action="minimize" aria-label="Minimize"><i></i></button>',
    '<button type="button" data-action="maximize" aria-label="Maximize"><i></i></button>',
    '<button type="button" data-action="close" aria-label="Close"><i></i></button>',
    '</div>',
  ].join('')
  document.body.prepend(bar)
  bar.querySelector('[data-action="minimize"]')?.addEventListener('click', () => api.minimize())
  bar.querySelector('[data-action="maximize"]')?.addEventListener('click', () => api.toggleMaximize())
  bar.querySelector('[data-action="close"]')?.addEventListener('click', () => api.close())
  bar.addEventListener('dblclick', event => {
    if (!event.target.closest('button')) api.toggleMaximize()
  })
  bar.addEventListener('contextmenu', event => {
    event.preventDefault()
    api.showSystemMenu(event.clientX, event.clientY)
  })
  const update = state => {
    bar.toggleAttribute('data-maximized', state.maximized)
    bar.toggleAttribute('data-fullscreen', state.fullScreen)
  }
  api.getState().then(update).catch(() => {})
  api.onStateChange(update)
})()
