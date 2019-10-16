const { addFileManagerShortcut } = require('./shortcut')
const { dialog, session } = require('electron')
const autoLaunch = require('./autolaunch')
const defaults = require('./defaults')
const { translate } = require('./i18n')

const log = require('../../core/app').logger({
  component: 'GUI'
})

const ONBOARDING_SCREEN_WIDTH = 768
const ONBOARDING_SCREEN_HEIGHT = 570
const LOGIN_SCREEN_WIDTH = ONBOARDING_SCREEN_WIDTH
const LOGIN_SCREEN_HEIGHT = 740
const OAUTH_SCREEN_WIDTH = ONBOARDING_SCREEN_WIDTH
const OAUTH_SCREEN_HEIGHT = 930

const WindowManager = require('./window_manager')

module.exports = class OnboardingWM extends WindowManager {
  windowOptions() {
    return {
      title: 'ONBOARDING',
      center: true,
      width: ONBOARDING_SCREEN_WIDTH,
      height: ONBOARDING_SCREEN_HEIGHT
    }
  }

  ipcEvents() {
    return {
      'register-remote': this.onRegisterRemote,
      'choose-folder': this.onChooseFolder,
      'start-sync': this.onStartSync
    }
  }

  hash() {
    return '#onboarding'
  }

  jumpToSyncPath() {
    this.shouldJumpToSyncPath = true
    // TODO: cleanup state management, ensure elm side sends something
    // through ports so we can trigger 'registration-done' without relying
    // on timeouts.
    this.send('registration-done')
    this.win.webContents.once('dom-ready', () => {
      setTimeout(() => {
        this.send('registration-done')
        // XXX: Passing this as an event sender is a bit hacky...
        this.checkSyncPath(defaults.syncPath, this)
      }, 20)
    })
  }

  create() {
    return super.create().then(() => {
      if (this.shouldJumpToSyncPath) {
        this.send('registration-done')
      }
    })
  }

  onOnboardingDone(handler) {
    this.afterOnboarding = handler
  }

  onRegisterRemote(event, arg) {
    let desktop = this.desktop
    let cozyUrl
    try {
      cozyUrl = desktop.checkCozyUrl(arg.cozyUrl)
    } catch (err) {
      return event.sender.send(
        'registration-error',
        translate('Address Invalid address!')
      )
    }
    desktop.config.cozyUrl = cozyUrl
    const onRegistered = (client, url) => {
      let resolveP
      const promise = new Promise(resolve => {
        resolveP = resolve
      })
      // TODO only centerOnScreen if needed to display the whole login screen
      //      and if the user hasn't moved the window before
      this.centerOnScreen(LOGIN_SCREEN_WIDTH, LOGIN_SCREEN_HEIGHT)
      this.win.loadURL(url)
      session.defaultSession.webRequest.onResponseStarted(
        [/\/auth\/authorize\?/],
        ({ statusCode }) => {
          if (statusCode === 200) {
            // TODO only centerOnScreen if needed to display the whole oauth screen
            //      and if the user hasn't moved the window before
            this.centerOnScreen(OAUTH_SCREEN_WIDTH, OAUTH_SCREEN_HEIGHT)
            // Unsubscribe from the event
            session.defaultSession.webRequest.onResponseStarted(null)
          }
        }
      )
      session.defaultSession.webRequest.onBeforeRedirect(({ redirectURL }) => {
        if (redirectURL.match(/^file:\/\//)) {
          // TODO only centerOnScreen if needed to display the whole folder screen
          //      and if the user hasn't moved the window before
          this.centerOnScreen(ONBOARDING_SCREEN_WIDTH, ONBOARDING_SCREEN_HEIGHT)
          resolveP(redirectURL)
          // Unsubscribe from the event
          session.defaultSession.webRequest.onBeforeRedirect(null)
        }
      })
      return promise
    }
    desktop.registerRemote(cozyUrl, arg.location, onRegistered).then(
      reg => {
        session.defaultSession.clearStorageData()
        this.win.webContents.once('dom-ready', () => {
          setTimeout(() => {
            event.sender.send('registration-done')
            this.checkSyncPath(defaults.syncPath, event.sender)
          }, 20)
        })
        this.win.loadURL(reg.client.redirectURI)
        if (!process.env.DEBUG) {
          autoLaunch.setEnabled(true)
        }
      },
      err => {
        log.error(err)
        if (err.code && err.code.match(/PROXY/)) {
          session.defaultSession.resolveProxy(cozyUrl, p => {
            event.sender.send(
              'registration-error',
              translate('Address Proxy issue') + p
            )
          })
        } else {
          event.sender.send(
            'registration-error',
            translate('Address No cozy instance at this address!')
          )
        }
      }
    )
  }

  onChooseFolder(event) {
    // FIXME: The modal may appear on background, either every time (e.g. Ubuntu)
    // or only the second time (e.g. Fedora)
    let folders = dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (folders && folders.length > 0) {
      this.checkSyncPath(folders[0], event.sender)
    }
  }

  checkSyncPath(syncPath, eventSender) {
    const result = this.desktop.checkSyncPath(syncPath)
    eventSender.send('folder-chosen', {
      folder: result.syncPath,
      error: result.error ? `Folder ${result.error}` : null
    })
    return result
  }

  onStartSync(event, syncPath) {
    const { error } = this.checkSyncPath(syncPath, event.sender)
    if (error) {
      log.warn({ err: error })
      return
    }
    let desktop = this.desktop
    if (!desktop.config.isValid()) {
      log.error('No client!')
      return
    }
    try {
      desktop.saveConfig(desktop.config.cozyUrl, syncPath)
      try {
        addFileManagerShortcut(desktop.config)
      } catch (err) {
        log.error(err)
      }
      this.afterOnboarding()
    } catch (err) {
      log.error(err)
      event.sender.send('folder-error', translate('Error Invalid path'))
    }
  }
}
