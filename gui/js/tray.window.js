const electron = require('electron')
const { dialog, shell } = electron
const { spawn } = require('child_process')
const path = require('path')

const { openNote } = require('../utils/notes')
const { openUrl } = require('../utils/urls')
const { openInWeb } = require('../utils/web')
const autoLaunch = require('./autolaunch')
const DetailsWM = require('./details.window')
const CozyWebWM = require('./cozy-web.window')
const { translate } = require('./i18n')

const log = require('../../core/app').logger({
  component: 'GUI'
})

const DASHBOARD_SCREEN_WIDTH = 440
const DASHBOARD_SCREEN_HEIGHT = 830

const popoverBounds = (
  wantedWidth,
  wantedHeight,
  trayposition,
  workArea,
  display,
  platform
) => {
  const actualWidth = Math.min(wantedWidth, Math.floor(0.9 * workArea.width))
  const actualHeight = Math.min(wantedHeight, Math.floor(0.9 * workArea.height))

  const newBounds = { width: actualWidth, height: actualHeight }

  if (platform === 'darwin') {
    // on MacOS, try to center the popup below the tray icon
    // later we might add a caret.

    if (!trayposition || !trayposition.x) {
      trayposition = {
        width: 1,
        height: 1,
        x: workArea.width - 1,
        y: workArea.height
      }
    }

    const centeredOnIcon =
      trayposition.x + Math.floor(trayposition.width / 2 - actualWidth / 2)
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
    newBounds.x = workArea.x + workArea.width - actualWidth
    newBounds.y = workArea.y + workArea.height - actualHeight
  } else if (workArea.width < display.width) {
    // left bar -> place window on bottom left
    newBounds.x = workArea.x
    newBounds.y = workArea.y + workArea.height - actualHeight
  } else if (workArea.height < display.height && workArea.y === 0) {
    // bottom bar -> place window on bottom right
    newBounds.x = workArea.x + workArea.width - actualWidth
    newBounds.y = workArea.y + workArea.height - actualHeight
  } else {
    // top bar or unknown -> place window on top right
    newBounds.x = workArea.x + workArea.width - actualWidth
    newBounds.y = workArea.y
  }

  return newBounds
}

const WindowManager = require('./window_manager')

module.exports = class TrayWM extends WindowManager {
  constructor(app, desktop, lastFiles) {
    super(app, desktop)
    this.lastFiles = lastFiles
    this.create()
  }

  windowOptions() {
    return {
      title: 'TRAY',
      windowPosition:
        process.platform === 'win32' ? 'trayBottomCenter' : 'trayCenter',
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

  makesAppVisible() {
    return false
  }

  create() {
    let pReady = super.create()
    if (!this.desktop.config.gui.visibleOnBlur) {
      this.win.on('blur', this.onBlur.bind(this))
    }
    return pReady
  }

  show(trayPos) {
    this.log.debug('show')
    super.show()
    this.placeWithTray(DASHBOARD_SCREEN_WIDTH, DASHBOARD_SCREEN_HEIGHT, trayPos)
    return Promise.resolve(this.win)
  }

  hash() {
    return '#tray'
  }

  placeWithTray(wantedWidth, wantedHeight, trayposition) {
    const bounds = this.win.getBounds()
    // TODO : be smarter about which display to use ?
    const displayObject = electron.screen.getDisplayMatching(bounds)
    const workArea = displayObject.workArea
    const display = displayObject.bounds
    const popover = {
      bounds,
      wantedWidth,
      wantedHeight,
      trayposition,
      workArea,
      display
    }

    try {
      popover.newBounds = popoverBounds(
        wantedWidth,
        wantedHeight,
        trayposition,
        workArea,
        display,
        process.platform
      )
      this.win.setBounds(popover.newBounds)
      log.trace({ popover }, 'placeWithTray ok')
    } catch (err) {
      log.warn({ err, popover }, 'Fail to placeWithTray')
      this.centerOnScreen(wantedWidth, wantedHeight)
    }
  }

  onBlur() {
    setTimeout(() => {
      if (!this.win.isFocused() && !this.win.isDevToolsFocused()) this.hide()
    }, 400)
  }

  hide() {
    if (this.win) {
      this.log.debug('hide')
      this.win.hide()
    }
  }

  shown() {
    return this.win.isVisible()
  }

  ipcEvents() {
    return {
      'go-to-cozy': (event, showInWeb) => {
        if (showInWeb) {
          shell.openExternal(this.desktop.config.cozyUrl)
        } else {
          let cozyWebWindow = new CozyWebWM(this.app, this.desktop)
          cozyWebWindow.show()
          cozyWebWindow.on('closed', () => {
            cozyWebWindow = null
          })
        }
      },
      'go-to-folder': async (event, showInWeb) => {
        this.openPath('', showInWeb)
      },
      'open-file': (event, path, showInWeb) => {
        this.log.debug({ path, showInWeb }, 'open file')
        this.openPath(path, showInWeb)
      },
      'show-in-parent': (event, path, showInWeb) => {
        this.showInParent(path, showInWeb)
      },
      'auto-launcher': (event, enabled) => autoLaunch.setEnabled(enabled),
      'close-app': () => {
        this.desktop.stopSync()
        this.app.quit()
      },
      'unlink-cozy': this.onUnlink,
      'manual-start-sync': () =>
        this.desktop.sync.forceSync().catch(err => {
          if (err) log.error({ err, sentry: true }, 'Could not run manual sync')
        }),
      userAlertDetails: (event, alert) => {
        let detailsWindow = new DetailsWM(this.app, this.desktop)
        detailsWindow.show().then(() => {
          if (detailsWindow) {
            detailsWindow.loadContent(alert)
          } else {
            log.error('could not load user alert details content')
          }
        })
        detailsWindow.on('closed', () => {
          detailsWindow = null
        })
      },
      userActionInProgress: (event, action) => {
        this.desktop.events.emit('user-action-inprogress', action)
      },
      userActionCommand: (event, cmd, action) => {
        this.desktop.events.emit('user-action-command', { cmd, action })
      },
      'reinitialize-synchronization': event => {
        log.info('Reinitializing synchronization...')
        this.desktop
          .stopSync()
          .then(() => event.sender.send('reinitialization', 'started'))
          .then(() => this.lastFiles.reset())
          .then(() => this.lastFiles.persist())
          .then(() => this.desktop.pouch.resetDatabase())
          .then(() => {
            this.desktop.startSync()
            return this.desktop.sync.started()
          })
          .then(() => event.sender.send('reinitialization', 'complete'))
          .catch(err => {
            log.error(
              { err, sentry: true },
              'failed reinitializing synchronization'
            )
            event.sender.send('reinitialization', 'failed')
          })
      }
    }
  }

  async openPath(pathToOpen, showInWeb = false) {
    const { desktop } = this

    pathToOpen = path.join(desktop.config.syncPath, pathToOpen)

    // TODO: find better way to check whether it's a note or not without
    // requiring modules from main.
    if (pathToOpen.endsWith('.cozy-note')) {
      openNote(pathToOpen, { desktop })
    } else if (process.platform === 'linux' && pathToOpen.endsWith('.url')) {
      // Linux Desktops generally don't provide any way to open those shortcuts.
      openUrl(pathToOpen)
    } else if (showInWeb) {
      openInWeb(pathToOpen, { desktop })
    } else if (pathToOpen === '') {
      shell.openPath(desktop.config.syncPath).catch(err => {
        log.error({ err, sentry: true }, 'Could not open sync folder')
      })
    } else {
      shell.openPath(pathToOpen).catch(err => {
        log.error(
          { err, path: pathToOpen, sentry: true },
          'Could not open given path'
        )
      })
    }
  }

  showInParent(pathToOpen, showInWeb = false) {
    const { desktop } = this

    pathToOpen = path.join(desktop.config.syncPath, pathToOpen)

    if (showInWeb) {
      openInWeb(path.dirname(pathToOpen), { desktop })
    } else {
      shell.showItemInFolder(pathToOpen)
    }
  }

  onUnlink() {
    if (!this.desktop.config.isValid()) {
      log.warn('Could not unlink remote Cozy. No valid config found!')
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
    const response = dialog.showMessageBoxSync(this.win, options)
    if (response === 0) {
      this.send('cancel-unlink')
      return
    }
    this.desktop
      .stopSync()
      .then(() => this.desktop.removeRemote())
      .then(() => log.info('remote removed'))
      .then(() => this.doRestart())
      .catch(err =>
        log.error({ err, sentry: true }, 'failed disconnecting client')
      )
  }

  doRestart() {
    if (process.env.APPIMAGE) {
      setTimeout(() => {
        log.info('Exiting old client...')
        this.app.exit(0)
      }, 50)
      const args = process.argv.slice(1).filter(a => a !== '--isHidden')
      log.info({ args, cmd: process.argv[0] }, 'Starting new client...')
      spawn(process.argv[0], args, { detached: true })
    } else {
      this.app.relaunch()
      log.info('Exiting old client...')
      this.app.exit(0)
    }
  }
}

module.exports.popoverBounds = popoverBounds
