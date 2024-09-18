/** Base implementation for all windows.
 *
 * @module gui/js/window_manager
 */

const { BrowserWindow, ipcMain, shell } = require('electron')
const _ = require('lodash')
const path = require('path')
const capabilities = require('../../core/utils/capabilities')
const flags = require('../../core/utils/flags')

const ELMSTARTUP = 400

/*::
export type WindowBanner = {
  level: string,
  title: string,
  details: string
}
*/

const log = require('../../core/app').logger({
  component: 'windows'
})

module.exports = class WindowManager {
  constructor(app, desktop) {
    this.win = null
    this.app = app
    this.desktop = desktop
    this.log = require('../../core/app').logger({
      component: 'GUI/' + this.windowOptions().title
    })

    let handlers = this.ipcEvents()
    Object.keys(handlers).forEach(name => {
      if (!handlers[name]) {
        throw new Error('undefined handler for event ' + name)
      }
      ipcMain.on(name, handlers[name].bind(this))
    })
    ipcMain.on('renderer-error', (event, err) => {
      // Sender can be a WebContents instance not yet attached to this.win, so
      // we compare the title from browserWindowOptions:
      if (
        _.get(event, 'sender.browserWindowOptions.title') ===
        this.windowOptions().title
      ) {
        this.log.error(err.message, { err, sentry: true })
      }
    })
  }

  /* abtract */
  windowOptions() {
    throw new Error('extend WindowManager before using')
  }

  /* abtract */
  ipcEvents() {
    throw new Error('extend WindowManager before using')
  }

  makesAppVisible() {
    return true
  }

  async show() {
    if (!this.win) await this.create()
    this.log.debug('show')

    // devTools
    if (process.env.WATCH === 'true' || process.env.DEBUG === 'true') {
      this.showDevTools()
    }

    this.win.show()

    return Promise.resolve(this.win)
  }

  showDevTools() {
    if (!this.win || this.win.webContents.isDestroyed()) return

    if (!this.devtools) {
      this.devtools = new BrowserWindow({ show: false })
      this.devtools.on('closed', () => {
        this.win.webContents.closeDevTools()
        this.devtools = null
      })
      this.win.webContents.setDevToolsWebContents(this.devtools.webContents)
    }

    this.win.on('hide', () => this.hideDevTools())
    this.win.on('closed', () => this.hideDevTools())

    this.win.webContents.openDevTools({ mode: 'detach' })
    this.devtools.show()
  }

  hideDevTools() {
    if (this.devtools) {
      this.devtools.hide()

      if (this.win) this.win.webContents.closeDevTools()
    }
  }

  hide() {
    if (this.win) {
      this.log.debug('hide')
      this.win.close()
    }
    this.win = null
  }

  shown() {
    return this.win != null
  }

  focus() {
    return this.win && this.win.focus()
  }

  reload() {
    if (this.win) {
      this.log.debug('reload')
      this.win.reload()
    }
  }

  send(...args) {
    this.win && this.win.webContents && this.win.webContents.send(...args)
  }

  on(event, handler) {
    this.win && this.win.on(event, handler)
  }

  once(event, handler) {
    this.win && this.win.once(event, handler)
  }

  async sendSyncConfig() {
    const { cozyUrl, deviceName, deviceId } = this.desktop.config
    this.send(
      'sync-config',
      cozyUrl,
      deviceName,
      deviceId,
      await capabilities(this.desktop.config),
      await flags(this.desktop.config)
    )
  }

  hash() {
    return ''
  }

  centerOnScreen(wantedWidth, wantedHeight) {
    try {
      this.win.setSize(wantedWidth, wantedHeight, true)
      this.win.center()
    } catch (err) {
      log.warn('Failed to centerOnScreen', { err, wantedWidth, wantedHeight })
    }
  }

  create() {
    this.log.debug('create')
    const opts = {
      indexPath: path.resolve(__dirname, '..', 'index.html'),
      ...this.windowOptions()
    }
    opts.webPreferences = {
      ...opts.webPreferences,
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
    // https://github.com/AppImage/AppImageKit/wiki/Bundling-Electron-apps
    if (process.platform === 'linux') {
      opts.icon = path.join(__dirname, '../images/icon.png')
    }
    this.win = new BrowserWindow({
      autoHideMenuBar: true,
      show: false,
      ...opts
    })
    this.win.on('unresponsive', () => {
      this.log.warn('Web page becomes unresponsive')
    })
    this.win.on('responsive', () => {
      this.log.warn('Web page becomes responsive again')
    })
    this.win.webContents.on(
      'did-fail-load',
      (event, errorCode, errorDescription, url, isMainFrame) => {
        const err = new Error(errorDescription)
        err.code = errorCode
        this.log.error(
          { err, url, isMainFrame, sentry: true },
          'failed loading window content'
        )
      }
    )
    this.centerOnScreen(opts.width, opts.height)

    // openExternalLinks
    this.win.webContents.on('will-navigate', (event, url) => {
      if (
        url.startsWith('http') &&
        !url.match('/auth/authorize') &&
        !url.match('/auth/twofactor')
      ) {
        event.preventDefault()
        shell.openExternal(url)
      }
    })

    // noMenu
    this.win.setMenu(null)
    this.win.setAutoHideMenuBar(true)

    // Most windows (e.g. onboarding, help...) make the app visible in macOS
    // dock (and cmd+tab) by default. App is hidden when windows is closed to
    // allow per-window visibility.
    if (process.platform === 'darwin' && this.makesAppVisible()) {
      this.app.dock.show()
      const showTime = Date.now()
      this.win.on('closed', () => {
        const hideTime = Date.now()
        setTimeout(() => {
          this.app.dock.hide()
        }, 1000 - (hideTime - showTime))
      })
    }

    // dont keep  hidden windows objects
    this.win.on('closed', () => {
      this.win = null
    })

    const windowCreated = new Promise(resolve => {
      if (opts.show === false) {
        resolve(this.win)
      } else {
        this.win.webContents.on('dom-ready', () => {
          setTimeout(() => {
            this.win.show()
            resolve(this.win)
          }, ELMSTARTUP)
        })
      }
    }).catch(err => log.error('failed showing window', { err, sentry: true }))

    this.win.loadURL(`file://${opts.indexPath}${this.hash()}`)

    return windowCreated
  }
}
