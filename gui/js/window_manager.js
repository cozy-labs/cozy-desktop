/** Base implementation for all windows.
 *
 * @module gui/js/window_manager
 */

const { BrowserWindow, ipcMain, shell } = require('electron')
const _ = require('lodash')
const path = require('path')
const electron = require('electron')

const ELMSTARTUP = 400

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
        this.log.error({ err }, err.message)
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

  show() {
    if (!this.win) return this.create()
    this.log.debug('show')
    this.win.show()
    return Promise.resolve(this.win)
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

  hash() {
    return ''
  }

  centerOnScreen(wantedWidth, wantedHeight) {
    try {
      const bounds = this.win.getBounds()
      // TODO : be smarter about which display to use ?
      const display = electron.screen.getDisplayMatching(bounds)
      const displaySize = display.workArea
      const actualWidth = Math.min(
        wantedWidth,
        Math.floor(0.9 * displaySize.width)
      )
      const actualHeight = Math.min(
        wantedHeight,
        Math.floor(0.9 * displaySize.height)
      )
      this.win.setBounds(
        {
          x: Math.floor((displaySize.width - actualWidth) / 2),
          y: Math.floor((displaySize.height - actualHeight) / 2),
          width: actualWidth,
          height: actualHeight
        },
        true /* animate on MacOS */
      )
    } catch (err) {
      log.error({ err, wantedWidth, wantedHeight }, 'Fail to centerOnScreen')
    }
  }

  create() {
    this.log.debug('create')
    const opts = this.windowOptions()
    // https://github.com/AppImage/AppImageKit/wiki/Bundling-Electron-apps
    if (process.platform === 'linux') {
      opts.icon = path.join(__dirname, '../images/icon.png')
    }
    this.win = new BrowserWindow({
      ...opts,
      autoHideMenuBar: true,
      show: false
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
        this.log.error({ errorCode, url, isMainFrame }, errorDescription)
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

    this.win.setVisibleOnAllWorkspaces(true)

    // noMenu
    this.win.setMenu(null)
    this.win.setAutoHideMenuBar(true)

    // Most windows (e.g. onboarding, help...) make the app visible in macOS
    // dock (and cmd+tab) by default. App is hidden when windows is closed to
    // allow per-window visibility.
    if (process.platform === 'darwin' && this.makesAppVisible()) {
      this.app.dock.show()
      this.win.on('closed', () => {
        this.app.dock.hide()
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
    }).catch(err => log.error(err))

    let indexPath = path.resolve(__dirname, '..', 'index.html')
    this.win.loadURL(`file://${indexPath}${this.hash()}`)

    // devTools
    if (process.env.WATCH === 'true' || process.env.DEBUG === 'true') {
      this.win.webContents.openDevTools({ mode: 'detach' })
    }

    return windowCreated
  }
}
