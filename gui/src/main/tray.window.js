const {dialog, shell} = require('electron')
const {spawn} = require('child_process')
const autoUpdater = require('./autoupdate')
const autoLaunch = require('./autolaunch')
const Positioner = require('electron-positioner')
const DASHBOARD_SCREEN_WIDTH = 330
const DASHBOARD_SCREEN_HEIGHT = 700

const {translate} = require('./i18n')

const log = require('cozy-desktop').default.logger({
  component: 'GUI'
})

const WindowManager = require('./window_manager')

module.exports = class TrayWM extends WindowManager {
  constructor (...opts) {
    super(...opts)
    this.create().then(() => this.hide())
  }

  windowOptions () {
    return {
      title: 'TRAY',
      windowPosition: (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter',
      frame: false,
      show: false,
      skipTaskbar: true,
      // transparent: true,
      width: DASHBOARD_SCREEN_WIDTH,
      height: DASHBOARD_SCREEN_HEIGHT,
      resizable: false,
      movable: false,
      maximizable: false
    }
  }

  create () {
    let pReady = super.create()
    // Once configured and running in the tray, the app doesn't need to be
    // visible anymore in macOS dock (and cmd+tab), even when the tray popover
    // is visible, until another window shows up.
    if (process.platform === 'darwin') this.app.dock.hide()
    this.positioner = new Positioner(this.win)
    this.win.on('blur', this.onBlur.bind(this))
    return pReady
  }

  show (trayPos) {
    this.log.debug('show')
    let pos = null

    if (trayPos === undefined || trayPos.x === 0) {
      pos = (process.platform === 'win32') ? 'bottomRight' : 'topRight'
    } else {
      pos = (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter'
    }
    this.positioner.move(pos, trayPos)
    this.win.show()

    return Promise.resolve(this.win)
  }

  onBlur () {
    setTimeout(() => {
      if (!this.win.isFocused() && !this.win.isDevToolsFocused()) this.hide()
    }, 400)
  }

  hide () {
    if (this.win) {
      this.log.debug('hide')
      this.win.hide()
    }
  }

  shown () {
    return this.win.isVisible()
  }

  ipcEvents () {
    return {
      'go-to-cozy': () => shell.openExternal(this.desktop.config.cozyUrl),
      'go-to-folder': () => shell.openItem(this.desktop.config.syncPath),
      'quit-and-install': () => autoUpdater.quitAndInstall(),
      'auto-launcher': (event, enabled) => autoLaunch.setEnabled(enabled),
      'unlink-cozy': this.onUnlink
    }
  }

  onUnlink () {
    if (!this.desktop.config.isValid()) {
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
    const response = dialog.showMessageBox(this.win, options)
    if (response === 0) {
      this.send('cancel-unlink')
      return
    }
    this.desktop.stopSync()
      .then(() => this.desktop.removeRemote())
      .then(() => log.info('removed'))
      .then(() => this.doRestart())
      .catch((err) => log.error(err))
  }

  doRestart () {
    setTimeout(this.app.quit, 50)
    const args = process.argv.slice(1).filter(a => a !== '--isHidden')
    spawn(process.argv[0], args, { detached: true })
  }
}
