const {BrowserWindow, ipcMain, shell} = require('electron')
const path = require('path')

const ELMSTARTUP = 400

const log = require('cozy-desktop').default.logger({
  component: 'windows'
})

module.exports = class WindowManager {
  constructor (app, desktop) {
    this.win = null
    this.app = app
    this.desktop = desktop
    this.log = require('cozy-desktop').default.logger({
      component: 'window' + this.windowOptions().title
    })

    let handlers = this.ipcEvents()
    Object.keys(handlers).forEach((name) => {
      if (!handlers[name]) {
        throw new Error('undefined handler for event ' + name)
      }
      ipcMain.on(name, handlers[name])
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

  show () {
    if (!this.win) return this.create()
    this.win.show()
    return Promise.resolve(this.win)
  }

  hide () {
    if (this.win) this.win.close()
    this.win = null
  }

  reload () {
    if (this.win) this.win.reload()
  }

  send (...args) {
    this.win && this.win.webContents && this.win.webContents.send(...args)
  }

  hash () {
    return ''
  }

  create () {
    this.win = new BrowserWindow(this.windowOptions())

    // openExternalLinks
    this.win.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('http') && !url.match('/auth/authorize')) {
        event.preventDefault()
        shell.openExternal(url)
      }
    })

    // noMenu
    this.win.setMenu(null)
    this.win.setAutoHideMenuBar(true)

    // dockApple
    if (process.platform === 'darwin') {
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
      setTimeout(() => { resolveCreate(this.win) }, ELMSTARTUP)
    })

    let indexPath = path.resolve(__dirname, '..', '..', 'index.html')
    this.win.loadURL(`file://${indexPath}${this.hash()}`)

    // devTools
    if (process.env.WATCH === 'true' || process.env.DEBUG === 'true') {
      this.win.webContents.openDevTools({mode: 'detach'})
    }

    return promiseReady
  }
}
