const {dialog, shell} = require('electron')
const {spawn} = require('child_process')
const autoUpdater = require('./autoupdate')
const autoLaunch = require('./autolaunch')
const Positioner = require('electron-positioner')
const DASHBOARD_SCREEN_WIDTH = 325
const DASHBOARD_SCREEN_HEIGHT = 600

const {translate} = require('./i18n')

const log = require('cozy-desktop').default.logger({
  component: 'GUI'
})

const WindowManager = require('./window_behaviour')

module.exports = class TrayWM extends WindowManager {
  windowOptions () {
    return {
      title: 'TRAY',
      windowPosition: (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter',
      frame: false,
      show: false,
      skipTaskbar: true,
      // transparent: true,
      width: DASHBOARD_SCREEN_WIDTH,
      height: DASHBOARD_SCREEN_HEIGHT
    }
  }

  create () {
    log.debug({tcreate: true})
    let pReady = super.create()
    log.debug({tcreateafer: true})
    this.positioner = new Positioner(this.win)
    this.win.on('blur', this.onBlur.bind(this))
    log.debug({tcreateafer2: true})
    return pReady
  }

  show (trayPos) {
    let pReady = (this.win) ? Promise.resolve(this.win) : this.create()

    let pos = null

    if (trayPos === undefined || trayPos.x === 0) {
      pos = (process.platform === 'win32') ? 'bottomRight' : 'topRight'
    } else {
      pos = (process.platform === 'win32') ? 'trayBottomCenter' : 'trayCenter'
    }
    this.positioner.move(pos, trayPos)
    this.win.show()

    return pReady
  }

  onBlur () {
    setTimeout(() => {
      if (!this.win.isFocused() && !this.win.isDevToolsFocused()) this.win.close()
    }, 400)
  }

  ipcEvents () {
    return {
      'go-to-cozy': () => shell.openExternal(this.desktop.config.cozyUrl),
      'go-to-folder': () => shell.openItem(this.desktop.config.syncPath),
      'quit-and-install': () => autoUpdater.quitAndInstall(),
      'auto-launcher': (event, enabled) => autoLaunch.setEnabled(enabled),
      'logout': () => {
        this.desktop.removeConfig()
        this.win.send('unlinked')
      },
      'unlink-cozy': this.onUnlink,
      'restart': this.onRestart
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
    dialog.showMessageBox(this.win, options, (response) => {
      if (response === 0) {
        this.win.send('cancel-unlink')
        return
      }
      this.desktop.stopSync().then(() => {
        this.desktop.removeRemote()
          .then(() => log.info('removed'))
          .then(() => this.win.send('unlinked'))
          .catch((err) => log.error(err))
      })
    })
  }

  onRestart () {
    setTimeout(this.app.quit, 50)
    const args = process.argv.slice(1).filter(a => a !== '--isHidden')
    spawn(process.argv[0], args, { detached: true })
  }
}
