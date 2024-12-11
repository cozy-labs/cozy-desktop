/* @flow */

const { enable: enableRemoteModule } = require('@electron/remote/main')
const { dialog, session, BrowserView, shell } = require('electron')

const autoLaunch = require('./autolaunch')
const defaults = require('./defaults')
const { translate } = require('./i18n')
const { SESSION_PARTITION_NAME } = require('./network')
const { addFileManagerShortcut } = require('./shortcut')
const WindowManager = require('./window_manager')
const log = require('../../core/app').logger({
  component: 'GUI'
})

/*::
import type { Event as ElectronEvent } from 'electron'
*/

const ONBOARDING_SCREEN_WIDTH = 768
const ONBOARDING_SCREEN_HEIGHT = 570
const LOGIN_SCREEN_WIDTH = ONBOARDING_SCREEN_WIDTH
const LOGIN_SCREEN_HEIGHT = 740

module.exports = class OnboardingWM extends WindowManager {
  windowOptions() {
    return {
      title: 'ONBOARDING',
      show: false,
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

  async jumpToSyncPath() {
    this.shouldJumpToSyncPath = true
    // TODO: cleanup state management, ensure elm side sends something
    // through ports so we can followup by sending the sync config without
    // relying on timeouts.
    await this.sendSyncConfig()
    this.win.webContents.once('dom-ready', () => {
      setTimeout(async () => {
        await this.sendSyncConfig()
        // XXX: Passing this as an event sender is a bit hacky...
        this.checkSyncPath(defaults.syncPath, this)
      }, 20)
    })
  }

  async openOAuthView(url /*: string */) {
    try {
      // Open remote OAuth flow in separate view, without Node integration.
      // This avoids giving access to Node's API to remote code and allows
      // remote code to load and make use of jQuery since it can't be loaded via
      // usual webpage means if a global `module` variable is defined (which is
      // the case with Node integration).
      this.oauthView = new BrowserView({
        webPreferences: { partition: SESSION_PARTITION_NAME }
      })

      // We want the view to take the entire available space so we get the
      // current window's bounds.
      const bounds = this.win.getContentBounds()

      await this.oauthView.webContents.loadURL(url)

      // Hide the message inviting to make sure the page URL is the expected
      // Cozy URL until we figure out how to properly display it during the
      // on-boarding.
      await this.oauthView.webContents.insertCSS(
        '.wrapper .wrapper-top .banner.caption { display: none; }'
      )

      this.win.setBrowserView(this.oauthView)

      // BrowserViews are positionned within their parent window so we need to
      // set the top left corner of the view to the origin.
      // XXX: in Electron v12.x, we can't set the bounds of a BrowserView until
      // it's been attached to the parent BrowserWindow. However, this makes the
      // display jitterish and we should change this behavior once we upgrade
      // Electron to a version allowing us to set the bounds before attaching
      // the view.
      this.oauthView.setAutoResize({
        width: true,
        height: true,
        horizontal: true,
        vertical: true
      })
      this.oauthView.setBounds({ ...bounds, x: 0, y: 0 })
      this.centerOnScreen(LOGIN_SCREEN_WIDTH, LOGIN_SCREEN_HEIGHT)

      if (this.devtools) {
        // Switch devtools to current view
        this.oauthView.webContents.setDevToolsWebContents(
          this.devtools.webContents
        )
        this.oauthView.webContents.openDevTools({ mode: 'detach' })
      }

      this.oauthView.webContents.setWindowOpenHandler(
        ({ url, disposition }) => {
          switch (disposition) {
            case 'foreground-tab':
            case 'background-tab':
            case 'new-window':
              shell.openExternal(url)
              return { action: 'deny' }
            default:
              return { action: 'allow' }
          }
        }
      )
      this.oauthView.webContents.on('will-navigate', (event, url) => {
        if (url.endsWith('.pdf')) {
          event.preventDefault()
          shell.openExternal(url)
        }
      })
    } catch (err) {
      log.error('failed loading OAuth view', { err, url, sentry: true })
    }
  }

  closeOAuthView() {
    if (this.devtools) {
      this.win.webContents.openDevTools()
    }

    if (this.oauthView) {
      this.win.removeBrowserView(this.oauthView)
    }
  }

  async create() {
    try {
      await super.create()

      enableRemoteModule(this.win.webContents)

      if (this.shouldJumpToSyncPath) {
        await this.jumpToSyncPath()
      }
    } catch (err) {
      log.error('could not create Onboarding window', { err })
    }
  }

  onOnboardingDone(handler /*: any */) {
    this.afterOnboarding = handler
  }

  async onRegisterRemote(
    event /*: ElectronEvent */,
    arg /*: { cozyUrl: string, location: string } */
  ) {
    const syncSession = session.fromPartition(SESSION_PARTITION_NAME)

    let desktop = this.desktop
    let cozyUrl
    try {
      cozyUrl = await desktop.checkCozyUrl(arg.cozyUrl)
    } catch (err) {
      return event.sender.send(
        'registration-error',
        translate('Address Invalid address')
      )
    }
    desktop.config.cozyUrl = cozyUrl

    const onRegistered = (client, url) => {
      let resolveP
      const promise = new Promise(resolve => {
        resolveP = resolve
      })
      syncSession.webRequest.onBeforeRequest(({ url }, callback) => {
        if (url.match(/^file:\/\//)) {
          // Chrome won't honor server redirects to local files and the window
          // will hang if we don't cancel it.
          syncSession.webRequest.onBeforeRequest(null)
          callback({ cancel: true })
        } else {
          callback({ cancel: false })
        }
      })
      syncSession.webRequest.onBeforeRedirect(({ redirectURL }) => {
        if (redirectURL.match(/^file:\/\//)) {
          syncSession.webRequest.onBeforeRedirect(null)
          // TODO only centerOnScreen if needed to display the whole folder screen
          //      and if the user hasn't moved the window before
          this.centerOnScreen(ONBOARDING_SCREEN_WIDTH, ONBOARDING_SCREEN_HEIGHT)
          resolveP(redirectURL)
        }
      })

      this.openOAuthView(url)
      return promise
    }
    return desktop.registerRemote(cozyUrl, arg.location, onRegistered).then(
      reg => {
        syncSession.clearStorageData()
        this.win.webContents.once('dom-ready', () => {
          setTimeout(async () => {
            await this.sendSyncConfig()
            this.checkSyncPath(defaults.syncPath, event.sender) // Why ???
          }, 20)
        })
        this.win.loadURL(reg.client.redirectURI)
        this.closeOAuthView()
        if (!process.env.DEBUG) {
          autoLaunch.setEnabled(true)
        }
        return
      },
      err => {
        log.error('failed registering device with remote Cozy', {
          err,
          cozyUrl
        })
        if (err.code && err.code.match(/PROXY/)) {
          syncSession.resolveProxy(cozyUrl, p => {
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
        throw err
      }
    )
  }

  onChooseFolder(event /*: ElectronEvent */) {
    // FIXME: The modal may appear on background, either every time (e.g. Ubuntu)
    // or only the second time (e.g. Fedora)
    let folders = dialog.showOpenDialogSync({
      properties: ['openDirectory', 'createDirectory']
    })
    if (folders && folders.length > 0) {
      this.checkSyncPath(folders[0], event.sender)
    }
  }

  checkSyncPath(syncPath /*: string */, eventSender /*: WindowManager */) {
    const result = this.desktop.checkSyncPath(syncPath)
    eventSender.send('folder-chosen', {
      folder: result.syncPath,
      error: result.error ? `Folder ${result.error}` : null
    })
    return result
  }

  onStartSync(event /*: ElectronEvent */, syncPath /*: string */) {
    const { error } = this.checkSyncPath(syncPath, event.sender)
    if (error) {
      log.error({ err: error })
      return
    }
    let desktop = this.desktop
    if (!desktop.config.isValid()) {
      log.error('Cannot start desktop client. No valid config found!')
      return
    }
    try {
      desktop.saveConfig(desktop.config.cozyUrl, syncPath)
      try {
        addFileManagerShortcut(desktop.config)
      } catch (err) {
        log.error('failed adding shortcuts in file manager', { err })
      }
      this.afterOnboarding()
    } catch (err) {
      log.error('failed starting sync', { err })
      event.sender.send('folder-error', translate('Error Invalid path'))
    }
  }
}
