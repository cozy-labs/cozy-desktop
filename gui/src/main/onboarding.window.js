const {addFileManagerShortcut} = require('./shortcut')
const {BrowserWindow, dialog, ipcMain, session} = require('electron')
const autoLaunch = require('./autolaunch')
const {translate} = require('./i18n')

const log = require('cozy-desktop').default.logger({
  component: 'GUI'
})

const ONBOARDING_SCREEN_WIDTH = 768
const ONBOARDING_SCREEN_HEIGHT = 570
const LOGIN_SCREEN_WIDTH = ONBOARDING_SCREEN_WIDTH
const LOGIN_SCREEN_HEIGHT = 700
const OAUTH_SCREEN_WIDTH = ONBOARDING_SCREEN_WIDTH
const OAUTH_SCREEN_HEIGHT = 930

const behaviours = require('./window_behaviour')

let afterOnboarding = null

let win = null
let app = null
let desktop = null

module.exports.init = (appRef, desktopRef) => {
  desktop = desktopRef
  app = appRef
}

module.exports.show = () => {
  if (!win) module.exports.create()
  win.show()
}

module.exports.hide = () => {
  if (win) win.close()
  win = null
}

module.exports.onOnboardingDone = (next) => {
  afterOnboarding = next
}

module.exports.create = () => {
  log.debug({'buildonboarding': true})
  win = new BrowserWindow({
    title: 'ONBOARDING',
    center: true,
    'auto-hide-menu-bar': true,
    icon: `${__dirname}/images/icon.png`,
    width: ONBOARDING_SCREEN_WIDTH,
    height: ONBOARDING_SCREEN_HEIGHT
  })
  win.loadURL(`file://${__dirname}/../../index.html`)
  // win.setMenu(Menu.buildFromTemplate([]))
  behaviours.noMenu(win)
  behaviours.devTools(win)
  behaviours.dockApple(app, win)
  behaviours.openExternalLinks(win)
  win.on('closed', () => { win = null })
  // win.webContents.on('dom-ready', appLoaded)
}

module.exports.send = (...args) => {
  log.debug({'there': win && !!win.webContents})
  if (win && win.webContents) {
    win.webContents.send(...args)
  }
}

ipcMain.on('register-remote', (event, arg) => {
  const cozyUrl = desktop.checkCozyUrl(arg.cozyUrl)
  desktop.config.cozyUrl = cozyUrl
  const onRegistered = (client, url) => {
    let resolveP
    const promise = new Promise((resolve) => { resolveP = resolve })
    win.setContentSize(LOGIN_SCREEN_WIDTH, LOGIN_SCREEN_HEIGHT, true)
    win.loadURL(url)
    win.webContents.on('did-get-response-details', (event, status, newUrl, originalUrl, httpResponseCode) => {
      if (newUrl.match(/\/auth\/authorize\?/) && httpResponseCode === 200) {
        const bounds = win.getBounds()
        const display = electron.screen.getDisplayMatching(bounds)
        const height = Math.min(display.workAreaSize.height - bounds.y, OAUTH_SCREEN_HEIGHT)
        win.setSize(OAUTH_SCREEN_WIDTH, height, true)
      }
    })
    win.webContents.on('did-get-redirect-request', (event, oldUrl, newUrl) => {
      if (newUrl.match('file://')) {
        win.setContentSize(ONBOARDING_SCREEN_WIDTH, ONBOARDING_SCREEN_HEIGHT, true)
        log.logger({'did-get-red': newUrl})
        resolveP(newUrl)
      }
    })
    return promise
  }
  desktop.registerRemote(cozyUrl, arg.location, onRegistered)
    .then(
      (reg) => {
        session.defaultSession.clearStorageData()
        win.webContents.once('dom-ready', () => setTimeout(() => event.sender.send('registration-done'), 20))
        win.loadURL(reg.client.redirectURI)
        autoLaunch.setEnabled(true)
      },
      (err) => {
        log.error(err)
        event.sender.send('registration-error', translate('Address No cozy instance at this address!'))
      }
    )
})

ipcMain.on('choose-folder', (event) => {
  let folders = dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })
  if (folders && folders.length > 0) {
    event.sender.send('folder-chosen', folders[0])
  }
})

ipcMain.on('start-sync', (event, syncPath) => {
  if (!desktop.config.isValid()) {
    log.error('No client!')
    return
  }
  try {
    desktop.saveConfig(desktop.config.cozyUrl, syncPath)
    try {
      addFileManagerShortcut(desktop.config)
    } catch (err) { log.error(err) }
    afterOnboarding()
  } catch (err) {
    log.error(err)
    event.sender.send('folder-error', translate('Error Invalid path'))
  }
})
