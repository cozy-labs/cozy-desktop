const {BrowserWindow, ipcMain} = require('electron')
const behaviours = require('./window_behaviour')
const HELP_SCREEN_WIDTH = 768
const HELP_SCREEN_HEIGHT = 570

let win = null
let app = null
let desktop = null

module.exports.init = (appRef, desktopRef) => {
  desktop = desktopRef
  app = appRef
}

module.exports.create = () => {
  if (win != null) return
  win = new BrowserWindow({
    title: 'HELP',
    icon: `${__dirname}/images/icon.png`,
    width: HELP_SCREEN_WIDTH,
    height: HELP_SCREEN_HEIGHT
  })
  win.loadURL(`file://${__dirname}/../../index.html#help`)
  behaviours.noMenu(win)
  behaviours.devTools(win)
  behaviours.dockApple(app, win)
  behaviours.openExternalLinks(win)
  win.on('closed', () => { win = null })
}

ipcMain.on('send-mail', (event, body) => {
  desktop.sendMailToSupport(body).then(
    () => { event.sender.send('mail-sent') },
    (err) => {
      event.sender.send('mail-sent', {
        message: err.message,
        name: err.name,
        stack: err.stack
      })
    }
  )
})

module.exports.show = () => {
  if (!win) module.exports.create()
  win.show()
}
