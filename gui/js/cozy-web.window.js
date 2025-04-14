const { BrowserWindow } = require('electron')

const SCREEN_WIDTH = 1060
const SCREEN_HEIGHT = 800

const WindowManager = require('./window_manager')

module.exports = class CozyWebWM extends WindowManager {
  windowOptions() {
    return {
      title: 'Twake Workplace',
      show: true,
      center: true,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT
    }
  }

  ipcEvents() {
    return {}
  }

  hash() {
    return '#twake-workplace'
  }

  on(event /*: Event */, handler /*: Function */) {
    this.win.on(event, handler)
  }

  create() {
    this.log.trace('create')
    const opts = {
      ...this.windowOptions(),
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false
      }
    }

    this.win = new BrowserWindow(opts)

    // dont keep  hidden windows objects
    this.win.on('closed', () => {
      this.win = null
    })
    this.win.on('unresponsive', () => {
      this.log.warn('Web page is unresponsive')
    })
    this.win.on('responsive', () => {
      this.log.warn('Web page is responsive again')
    })
    this.centerOnScreen(opts.width, opts.height)

    // Most windows (e.g. onboarding, help...) make the app visible in macOS
    // dock (and cmd+tab) by default. App is hidden when windows is closed to
    // allow per-window visibility.
    if (process.platform === 'darwin') {
      this.app.dock.show()
      const showTime = Date.now()
      this.win.on('closed', () => {
        const hideTime = Date.now()
        setTimeout(() => {
          this.app.dock.hide()
        }, 1000 - (hideTime - showTime))
      })
    }

    const windowCreated = new Promise((resolve, reject) => {
      this.win.webContents.on(
        'did-fail-load',
        (event, errorCode, errorDescription, url) => {
          const err = new Error(errorDescription)
          err.code = errorCode
          this.log.error({ err, url }, 'failed loading window content')
          // TODO: show error Window when Cozy is unreachable instead of a white
          // page.
          reject(err)
        }
      )
      // TODO: use `ready-to-show` instead?
      // See https://www.electronjs.org/docs/latest/api/browser-window#event-ready-to-show
      this.win.webContents.on('dom-ready', () => {
        this.win.show()
        resolve(this.win)
      })
    })
    this.win.loadURL(this.desktop.config.cozyUrl)

    // devTools
    if (process.env.WATCH === 'true' || process.env.DEBUG === 'true') {
      this.win.webContents.openDevTools({ mode: 'detach' })
    }

    return windowCreated
  }
}
