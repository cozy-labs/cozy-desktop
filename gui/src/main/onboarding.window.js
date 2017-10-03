const {addFileManagerShortcut} = require('./shortcut')
const {dialog, session} = require('electron')
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

const WindowManager = require('./window_manager')

module.exports = class OnboardingWM extends WindowManager {
  windowOptions () {
    return {
      title: 'ONBOARDING',
      center: true,
      'auto-hide-menu-bar': true,
      width: ONBOARDING_SCREEN_WIDTH,
      height: ONBOARDING_SCREEN_HEIGHT
    }
  }

  ipcEvents () {
    return {
      'register-remote': this.onRegisterRemote,
      'choose-folder': this.onChooseFolder,
      'start-sync': this.onStartSync
    }
  }

  onOnboardingDone (handler) {
    this.afterOnboarding = handler
  }

  onRegisterRemote (event, arg) {
    let desktop = this.desktop
    const cozyUrl = desktop.checkCozyUrl(arg.cozyUrl)
    desktop.config.cozyUrl = cozyUrl
    const onRegistered = (client, url) => {
      let resolveP
      const promise = new Promise((resolve) => { resolveP = resolve })
      this.win.setContentSize(LOGIN_SCREEN_WIDTH, LOGIN_SCREEN_HEIGHT, true)
      this.win.loadURL(url)
      this.win.webContents.on('did-get-response-details', (event, status, newUrl, originalUrl, httpResponseCode) => {
        if (newUrl.match(/\/auth\/authorize\?/) && httpResponseCode === 200) {
          const bounds = win.getBounds()
          const display = electron.screen.getDisplayMatching(bounds)
          const height = Math.min(display.workAreaSize.height - bounds.y, OAUTH_SCREEN_HEIGHT)
          win.setSize(OAUTH_SCREEN_WIDTH, height, true)
        }
      })
      this.win.webContents.on('did-get-redirect-request', (event, oldUrl, newUrl) => {
        if (newUrl.match('file://')) {
          this.win.setContentSize(ONBOARDING_SCREEN_WIDTH, ONBOARDING_SCREEN_HEIGHT, true)
          resolveP(newUrl)
        }
      })
      return promise
    }
    desktop.registerRemote(cozyUrl, arg.location, onRegistered)
      .then(
        (reg) => {
          session.defaultSession.clearStorageData()
          this.win.webContents.once('dom-ready', () => setTimeout(() => event.sender.send('registration-done'), 20))
          this.win.loadURL(reg.client.redirectURI)
          autoLaunch.setEnabled(true)
        },
        (err) => {
          log.error(err)
          event.sender.send('registration-error', translate('Address No cozy instance at this address!'))
        }
      )
  }

  onChooseFolder (event) {
    let folders = dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (folders && folders.length > 0) {
      event.sender.send('folder-chosen', folders[0])
    }
  }

  onStartSync (event, syncPath) {
    let desktop = this.desktop
    if (!desktop.config.isValid()) {
      log.error('No client!')
      return
    }
    try {
      desktop.saveConfig(desktop.config.cozyUrl, syncPath)
      try {
        addFileManagerShortcut(desktop.config)
      } catch (err) { log.error(err) }
      this.afterOnboarding()
    } catch (err) {
      log.error(err)
      event.sender.send('folder-error', translate('Error Invalid path'))
    }
  }
}
