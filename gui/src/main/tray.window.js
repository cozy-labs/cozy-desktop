const {BrowserWindow, dialog, shell, ipcMain} = require('electron')
const {spawn} = require('child_process')
const autoUpdater = require('./autoupdate')
const autoLaunch = require('./autolaunch')
const Positioner = require('electron-positioner')
const DASHBOARD_SCREEN_WIDTH = 325
const DASHBOARD_SCREEN_HEIGHT = 600

const {translate} = require('./i18n')

const log = require('cozy-desktop').default.logger({
  component: 'GUI'
})

const behaviours = require('./window_behaviour')

let win = null
let app = null
let desktop = null

module.exports.init = (appRef, desktopRef) => {
  desktop = desktopRef
  app = appRef
}

module.exports.create = () => {
  log.debug({'create': 'onboarding'})
  if (win != null) return
  win = new BrowserWindow({
    title: 'TRAY',
    icon: `${__dirname}/images/icon.png`,
    windowPosition: (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter',
    frame: false,
    show: false,
    skipTaskbar: true,
    // transparent: true,
    width: DASHBOARD_SCREEN_WIDTH,
    height: DASHBOARD_SCREEN_HEIGHT
  })
  win.loadURL(`file://${__dirname}/../../index.html#dashboard`)
  behaviours.noMenu(win)
  // behaviours.devTools(win)
  behaviours.dockApple(app, win)
  behaviours.openExternalLinks(win)
  win.on('closed', () => { win = null })
  win.on('blur', () => setTimeout(() => { if (!win.isFocused() && !win.isDevToolsFocused()) win.close() }, 400))
  win.positioner = new Positioner(win)
}

module.exports.onReady = (cb) => {
  win && win.webContents && win.webContents.once('dom-ready', () => {
    setTimeout(cb, 100) // elm initialization
  })
}

module.exports.send = (...args) => {
  if (win && win.webContents) {
    win.webContents.send(...args)
  }
}

module.exports.reload = () => {
  if (win) win.reload()
}

module.exports.show = (trayPos) => {
  if (!win) module.exports.create()
  let pos = null
  if (trayPos === undefined || trayPos.x === 0) {
    pos = (process.platform === 'win32') ? 'bottomRight' : 'topRight'
  } else {
    pos = (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter'
  }

  win.positioner.move(pos, trayPos)
  win.show()
}

module.exports.hide = () => {
  if (win) win.close()
  win = null
}

ipcMain.on('go-to-cozy', () => shell.openExternal(desktop.config.cozyUrl))
ipcMain.on('go-to-folder', () => shell.openItem(desktop.config.syncPath))
ipcMain.on('quit-and-install', () => autoUpdater.quitAndInstall())
ipcMain.on('auto-launcher', (event, enabled) => autoLaunch.setEnabled(enabled))
ipcMain.on('logout', () => {
  desktop.removeConfig()
  win.send('unlinked')
})

ipcMain.on('unlink-cozy', () => {
  if (!desktop.config.isValid()) {
    log.error('No client!')
    return
  }
  const options = {
    type: 'question',
    title: translate('Unlink Title'),
    message: translate('Unlink Message'),
    detail: translate('Unlink Detail'),
    buttons: [translate('Unlink Cancel'), translate('Unlink OK')],
    cancelId: 0,
    defaultId: 1
  }
  dialog.showMessageBox(win, options, (response) => {
    if (response === 0) {
      win.send('cancel-unlink')
      return
    }
    desktop.stopSync().then(() => {
      desktop.removeRemote()
        .then(() => log.info('removed'))
        .then(() => win.send('unlinked'))
        .catch((err) => log.error(err))
    })
  })
})

ipcMain.on('restart', () => {
  setTimeout(app.quit, 50)
  const args = process.argv.slice(1).filter(a => a !== '--isHidden')
  spawn(process.argv[0], args, { detached: true })
})
