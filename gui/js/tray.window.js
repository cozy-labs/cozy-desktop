/* @flow */

const electron = require('electron')
const { dialog, shell } = electron
const path = require('path')
const { enable: enableRemoteModule } = require('@electron/remote/main')

const { openNote } = require('../utils/notes')
const { openUrl } = require('../utils/urls')
const { openInWeb } = require('../utils/web')
const autoLaunch = require('./autolaunch')
const DetailsWM = require('./details.window')
const CozyWebWM = require('./cozy-web.window')
const { translate } = require('./i18n')
const { restart } = require('./actions')

/*::
import type { App as ElectronApp, Event as ElectronEvent } from 'electron'
import type { App as CoreApp } from '../../core/app'
import type { UserActionCommand, UserAlert } from '../../core/syncstate'

type Bounds = {
  width: number,
  height: number,
  x: number,
  y: number,
}
*/

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

  const newBounds = { width: actualWidth, height: actualHeight, x: 0, y: 0 }

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
  constructor(
    app /*: ElectronApp */,
    desktop /*: CoreApp */,
    lastFiles /*: Object */
  ) {
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

    enableRemoteModule(this.win.webContents)

    if (
      process.env.WATCH !== 'true' &&
      !this.desktop.config.gui.visibleOnBlur
    ) {
      this.win.on('blur', this.onBlur.bind(this))
    }
    return pReady
  }

  show(trayPos /*: Bounds */) {
    this.log.debug('show')
    super.show()
    this.placeWithTray(DASHBOARD_SCREEN_WIDTH, DASHBOARD_SCREEN_HEIGHT, trayPos)
    return Promise.resolve(this.win)
  }

  hash() {
    return '#tray'
  }

  placeWithTray(
    wantedWidth /*: number */,
    wantedHeight /*: number */,
    trayposition /*: Bounds */
  ) {
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
      const newBounds = popoverBounds(
        wantedWidth,
        wantedHeight,
        trayposition,
        workArea,
        display,
        process.platform
      )
      this.win.setBounds(newBounds)
      log.trace({ popover, newBounds }, 'placeWithTray ok')
    } catch (err) {
      log.warn({ err, popover }, 'Fail to placeWithTray')
      this.centerOnScreen(wantedWidth, wantedHeight)
    }
  }

  onBlur() {
    setTimeout(() => {
      if (
        !this.win.isFocused() &&
        !this.win.isAlwaysOnTop() &&
        !this.win.webContents.isDevToolsOpened()
      )
        this.hide()
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
      confirm: async (
        event /*: ElectronEvent */,
        {
          id,
          title,
          message,
          detail,
          mainAction
        } /*: { id: string, title: string, message: string, detail: string, mainAction: string } */
      ) => {
        this.win.setAlwaysOnTop(true, 'pop-up-menu')
        try {
          const { response } = await dialog.showMessageBox(this.win, {
            type: 'question',
            title,
            message,
            detail,
            buttons: [translate('Cancel'), mainAction],
            cancelId: 0,
            defaultId: 1
          })
          event.sender.send('confirmation', { id, confirmed: response === 1 })
        } finally {
          this.win.setAlwaysOnTop(false)
        }
      },
      'go-to-cozy': (event /*: ElectronEvent */, showInWeb /*: boolean */) => {
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
      'go-to-folder': async (
        event /*: ElectronEvent */,
        showInWeb /*: boolean */
      ) => {
        this.openPath('', showInWeb)
      },
      'open-file': (
        event /*: ElectronEvent */,
        path /*: string */,
        showInWeb /*: boolean */
      ) => {
        this.log.debug({ path, showInWeb }, 'open file')
        this.openPath(path, showInWeb)
      },
      'show-in-parent': (
        event /*: ElectronEvent */,
        path /*: string */,
        showInWeb /*: boolean */
      ) => {
        this.showInParent(path, showInWeb)
      },
      'auto-launcher': (event /*: ElectronEvent */, enabled /*: boolean */) =>
        autoLaunch.setEnabled(enabled),
      'close-app': async () => {
        try {
          await this.desktop.stopSync()
          await this.app.quit()
        } catch (err) {
          log.error({ err, sentry: true }, 'error while quitting client')
        }
      },
      'unlink-cozy': () => {
        if (!this.desktop.config.isValid()) {
          log.warn('Could not disconnect client. No valid config found!')
          return
        }
        log.info('Diconnecting client...')
        this.desktop
          .stopSync()
          .then(() => this.desktop.removeRemote())
          .then(() => log.info('remote removed'))
          .then(() => restart())
          .catch(err =>
            log.error({ err, sentry: true }, 'failed disconnecting client')
          )
      },
      'manual-start-sync': () =>
        this.desktop.sync.forceSync().catch(err => {
          if (err) log.error({ err, sentry: true }, 'Could not run manual sync')
        }),
      userAlertDetails: async (
        event /*: ElectronEvent */,
        alert /*: UserAlert */
      ) => {
        try {
          let detailsWindow = new DetailsWM(this.app, this.desktop)
          if (detailsWindow) {
            detailsWindow.create()
            detailsWindow.on('closed', () => {
              detailsWindow = null
            })
            await detailsWindow.show()
            await detailsWindow.loadContent(alert)
          } else {
            log.error('could not load user alert details content')
          }
        } catch (err) {
          log.error({ err }, 'could not load user alert details content')
        }
      },
      userActionInProgress: (
        event /*: ElectronEvent */,
        action /*: UserAlert */
      ) => {
        this.desktop.events.emit('user-action-inprogress', action)
      },
      userActionCommand: (
        event /*: ElectronEvent */,
        cmd /*: UserActionCommand */,
        action /*: UserAlert */
      ) => {
        this.desktop.events.emit('user-action-command', { cmd, action })
      },
      'reinitialize-synchronization': (event /*: ElectronEvent */) => {
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

  async openPath(pathToOpen /*: string */, showInWeb /*: boolean */ = false) {
    const { desktop } = this

    pathToOpen = path.join(desktop.config.syncPath, pathToOpen)

    // TODO: find better way to check whether it's a note or not without
    // requiring modules from main.
    if (pathToOpen.endsWith('.cozy-note')) {
      await openNote(pathToOpen, { desktop })
    } else if (process.platform === 'linux' && pathToOpen.endsWith('.url')) {
      // Linux Desktops generally don't provide any way to open those shortcuts.
      await openUrl(pathToOpen)
    } else if (showInWeb) {
      await openInWeb(pathToOpen, { desktop })
    } else if (pathToOpen === '') {
      const err = await shell.openPath(desktop.config.syncPath)
      if (err !== '') {
        log.error({ err, sentry: true }, 'Could not open sync folder')
      }
    } else {
      const err = await shell.openPath(pathToOpen)
      if (err !== '') {
        log.error(
          { err, path: pathToOpen, sentry: true },
          'Could not open given path'
        )
      }
    }
  }

  showInParent(pathToOpen /*: string */, showInWeb /*: boolean */ = false) {
    const { desktop } = this

    pathToOpen = path.join(desktop.config.syncPath, pathToOpen)

    if (showInWeb) {
      openInWeb(path.dirname(pathToOpen), { desktop })
    } else {
      shell.showItemInFolder(pathToOpen)
    }
  }
}

module.exports.popoverBounds = popoverBounds
