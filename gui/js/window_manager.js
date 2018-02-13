const {BrowserWindow, ipcMain, shell} = require('electron')
const path = require('path')
const electron = require('electron')

const ELMSTARTUP = 400

const log = require('../../core-built/app.js').default.logger({
  component: 'windows'
})

module.exports = class WindowManager {
  constructor (app, desktop) {
    this.win = null
    this.app = app
    this.desktop = desktop
    this.log = require('../../core-built/app.js').default.logger({
      component: 'GUI/' + this.windowOptions().title
    })

    let handlers = this.ipcEvents()
    Object.keys(handlers).forEach((name) => {
      if (!handlers[name]) {
        throw new Error('undefined handler for event ' + name)
      }
      ipcMain.on(name, handlers[name].bind(this))
    })
  }

  /* abtract */
  windowOptions () {
    throw new Error('extend WindowManager before using')
  }

  /* abtract */
  ipcEvents () {
    throw new Error('extend WindowManager before using')
  }

  makesAppVisible () {
    return true
  }

  show () {
    if (!this.win) return this.create()
    this.log.debug('show')
    this.win.show()
    return Promise.resolve(this.win)
  }

  hide () {
    if (this.win) {
      this.log.debug('hide')
      this.win.close()
    }
    this.win = null
  }

  shown () {
    return this.win != null
  }

  focus () {
    return this.win && this.win.focus()
  }

  reload () {
    if (this.win) {
      this.log.debug('reload')
      this.win.reload()
    }
  }

  send (...args) {
    this.win && this.win.webContents && this.win.webContents.send(...args)
  }

  hash () {
    return ''
  }

  centerOnScreen (wantedWidth, wantedHeight) {
    try {
      const bounds = this.win.getBounds()
      // TODO : be smarter about which display to use ?
      const display = electron.screen.getDisplayMatching(bounds)
      const displaySize = display.workArea
      const actualWidth = Math.min(wantedWidth, Math.floor(0.9 * displaySize.width))
      const actualHeight = Math.min(wantedHeight, Math.floor(0.9 * displaySize.height))
      this.win.setBounds({
        x: Math.floor((displaySize.width - actualWidth) / 2),
        y: Math.floor((displaySize.height - actualHeight) / 2),
        width: actualWidth,
        height: actualHeight
      }, true /* animate on MacOS */)
    } catch (err) {
      log.error({err, wantedWidth, wantedHeight}, 'Fail to centerOnScreen')
    }
  }

  placeWithTray (wantedWidth, wantedHeight, trayposition) {
    try {
      const bounds = this.win.getBounds()
      // TODO : be smarter about which display to use ?
      const displayObject = electron.screen.getDisplayMatching(bounds)
      const workArea = displayObject.workArea
      const display = displayObject.bounds
      const actualWidth = Math.min(wantedWidth, Math.floor(0.9 * workArea.width))
      const actualHeight = Math.min(wantedHeight, Math.floor(0.9 * workArea.height))

      const newBounds = {width: actualWidth, height: actualHeight}

      if (process.platform === 'darwin') {
        // on MacOS, try to center the popup below the tray icon
        // later we might add a caret.

        if (!trayposition || !trayposition.x) {
          trayposition = {
            x: workArea.width,
            y: workArea.height
          }
        }

        const centeredOnIcon = trayposition.x + Math.floor(trayposition.width / 2 - actualWidth / 2)
        const fullRight = workArea.width - actualWidth

        // in case where the icon is closer to the left border than half the windows width
        // we put the window against the right border.
        // later the caret will need to be moved from its center position in this case.
        newBounds.x = Math.min(centeredOnIcon, fullRight)
        newBounds.y = workArea.y // at the top

      // all others OS let users define where to put the traybar
      // icons are always on the right or bottom of the bar
      // Let's try to guess where the bar is so we can place the window
      // on window it is not platform-like to center above tray icon
      // TODO contibute this to electron-positioner
      } else if (workArea.width < display.width && workArea.x === 0) {
        // right bar -> place window on bottom right
        newBounds.x = workArea.width - actualWidth
        newBounds.y = workArea.y + workArea.height - actualHeight
      } else if (workArea.width < display.width) {
        // left bar -> place window on bottom left
        newBounds.x = workArea.x
        newBounds.y = workArea.y + workArea.height - actualHeight
      } else if (workArea.y === 0) {
        // bottom bar -> place window on bottom right
        newBounds.x = workArea.width - actualWidth
        newBounds.y = workArea.y + workArea.height - actualHeight
      } else {
        // top bar -> place window on top right
        newBounds.x = workArea.width - actualWidth
        newBounds.y = workArea.y
      }
      this.win.setBounds(newBounds)
    } catch (err) {
      log.error({err, wantedWidth, wantedHeight, trayposition}, 'Fail to placeWithTray')
      this.centerOnScreen(wantedWidth, wantedHeight)
    }
  }

  create () {
    this.log.debug('create')
    const opts = this.windowOptions()
    opts.show = false
    this.win = new BrowserWindow(opts)
    this.centerOnScreen(opts.width, opts.height)

    // openExternalLinks
    this.win.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('http') && !url.match('/auth/authorize')) {
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
      this.win.on('closed', () => { this.app.dock.hide() })
    }

    // dont keep  hidden windows objects
    this.win.on('closed', () => { this.win = null })

    let resolveCreate = null
    let promiseReady = new Promise((resolve, reject) => {
      resolveCreate = resolve
    }).catch((err) => log.error(err))

    this.win.webContents.on('dom-ready', () => {
      setTimeout(() => {
        this.win.show()
        resolveCreate(this.win)
      }, ELMSTARTUP)
    })

    let indexPath = path.resolve(__dirname, '..', 'index.html')
    this.win.loadURL(`file://${indexPath}${this.hash()}`)

    // devTools
    if (process.env.WATCH === 'true' || process.env.DEBUG === 'true') {
      this.win.webContents.openDevTools({mode: 'detach'})
    }

    return promiseReady
  }
}
