const {shell} = require('electron')

module.exports.openExternalLinks = (win) => {
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http') && !url.match('/auth/authorize')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
  return win
}

module.exports.noMenu = (win) => {
  win.setMenu(null)
  win.setAutoHideMenuBar(true)
}

module.exports.devTools = (win) => {
  if (process.env.WATCH === 'true' || process.env.DEBUG === 'true') {
    win.webContents.openDevTools({mode: 'detach'})
  }
}

module.exports.dockApple = (app, win) => {
  if (process.platform === 'darwin') {
    app.dock.show()
    win.on('closed', () => { app.dock.hide() })
  }
}
