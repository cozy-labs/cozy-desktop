'use strict'

const Desktop = require('../core/app.js')
const notes = require('./notes')
const pkg = require('../package.json')

const { debounce, pick } = require('lodash')
const path = require('path')
const os = require('os')
const fse = require('fs-extra')

const proxy = require('./js/proxy')
const { COZY_CLIENT_REVOKED_MESSAGE } = require('../core/remote/cozy')
const migrations = require('../core/pouch/migrations')
const config = require('../core/config')
const winRegistry = require('../core/utils/win_registry')

const autoLaunch = require('./js/autolaunch')
const lastFiles = require('./js/lastfiles')
const tray = require('./js/tray')
const TrayWM = require('./js/tray.window.js')
const UpdaterWM = require('./js/updater.window.js')
const HelpWM = require('./js/help.window.js')
const OnboardingWM = require('./js/onboarding.window.js')
const MarkdownViewerWindow = require('./js/markdown-viewer.window.js')

const { selectIcon } = require('./js/fileutils')
const { buildAppMenu } = require('./js/appmenu')
const i18n = require('./js/i18n')
const { translate } = i18n
const { incompatibilitiesErrorMessage } = require('./js/incompatibilitiesmsg')
const UserActionRequiredDialog = require('./js/components/UserActionRequiredDialog')
const { app, Menu, Notification, ipcMain, dialog, shell } = require('electron')

const DAILY = 3600 * 24 * 1000

// FIXME: https://github.com/electron/electron/issues/10864
if (process.platform === 'win32') app.setAppUserModelId('io.cozy.desktop')

const log = Desktop.logger({
  component: 'GUI'
})
process.on('uncaughtException', err => log.error(err))

const mainInstance = app.requestSingleInstanceLock()
if (!mainInstance && !process.env.COZY_DESKTOP_PROPERTY_BASED_TESTING) {
  log.warn('Cozy Drive is already running. Exiting...')
  app.exit()
}

let desktop
let state = 'not-configured'
let errorMessage = ''
let userActionRequired = null
let diskTimeout = null
let onboardingWindow = null
let helpWindow = null
let updaterWindow = null
let trayWindow = null

let desktopIsReady, desktopIsKO
const whenDesktopReady = new Promise((resolve, reject) => {
  desktopIsReady = resolve
  desktopIsKO = reject
})

let shouldStartSync = true
const preventSyncStart = () => {
  shouldStartSync = false
}

const notificationsState = {
  revokedAlertShown: false,
  syncDirUnlinkedShown: false,
  invalidConfigShown: false,
  notifiedMsg: ''
}

const toggleWindow = bounds => {
  if (trayWindow.shown()) trayWindow.hide()
  else showWindow(bounds)
}

const setupDesktop = async () => {
  try {
    await desktop.setup()
    desktopIsReady()

    // We do it here since Sentry's setup happens in `desktop.setup()`
    if (process.platform === 'win32') {
      winRegistry.removeOldUninstallKey().catch(err => {
        if (err instanceof winRegistry.RegeditError) {
          log.error(
            { err, sentry: true },
            'Failed to remove uninstall registry key'
          )
        }
      })
    }
  } catch (err) {
    log.fatal({ err }, 'Could not setup app')

    desktopIsKO(err)

    if (err instanceof config.InvalidConfigError) {
      showInvalidConfigError()
    } else if (err instanceof migrations.MigrationFailedError) {
      showMigrationError(err)
    } else {
      dialog.showMessageBox(null, {
        type: 'error',
        message: err.message,
        buttons: [translate('AppMenu Close')]
      })
    }
    app.quit()
    return
  }
}

const startApp = async () => {
  if (!desktop.config.syncPath) {
    onboardingWindow.show()
    // registration is done, but we need a syncPath
    if (desktop.config.isValid()) {
      onboardingWindow.jumpToSyncPath()
    }
  } else {
    startSync()
  }
}

const showWindow = bounds => {
  if (
    notificationsState.revokedAlertShown ||
    notificationsState.syncDirUnlinkedShown
  )
    return
  if (updaterWindow && updaterWindow.shown()) return updaterWindow.focus()
  if (!desktop.config.syncPath) {
    onboardingWindow.show(bounds)
    // registration is done, but we need a syncPath
    if (desktop.config.isValid()) {
      onboardingWindow.jumpToSyncPath()
    }
  } else {
    if (desktop.sync) {
      if (userActionRequired) {
        trayWindow.send('user-action-required', userActionRequired)
      } else if (state === 'up-to-date' || state === 'online') {
        trayWindow.send('up-to-date')
      } else if (state === 'offline') {
        trayWindow.send('offline')
      } else if (state === 'error') {
        sendErrorToMainWindow(errorMessage)
      }
      sendDiskUsage()
    }
    trayWindow.show(bounds).then(async () => {
      const { cozyUrl, deviceName } = desktop.config
      trayWindow.send('synchronization', cozyUrl, deviceName)

      const files = await lastFiles.list()
      for (const file of files) {
        trayWindow.send('transfer', file)
      }
    })
  }
}

const showInvalidConfigError = () => {
  const options = {
    type: 'warning',
    title: translate('InvalidConfiguration Invalid configuration'),
    message: translate(
      'InvalidConfiguration The client configuration is invalid'
    ),
    detail: translate(
      'InvalidConfiguration Please log out and go through the onboarding again or contact us at contact@cozycloud.cc'
    ),
    buttons: [translate('Button Log out'), translate('Button Contact support')],
    defaultId: 0
  }
  const userChoice = dialog.showMessageBox(null, options)
  if (userChoice === 0) {
    desktop
      .removeConfig()
      .then(() => log.info('removed'))
      .catch(err => log.error(err))
  } else {
    helpWindow = new HelpWM(app, desktop)
    helpWindow.show()
  }
}

const showMigrationError = (err /*: Error */) => {
  const errorDetails = [`${err.name}:`].concat(
    err.errors.map(pouchErr => pouchErr.toString())
  )

  const options = {
    type: 'error',
    title: translate('AppUpgrade App upgrade failed'),
    message: translate(
      'AppUpgrade An error happened after we tried upgrading your Cozy Desktop version. Please contact support at contact@cozycloud.cc.'
    ),
    detail: errorDetails.join('\n'),
    buttons: [translate('Button Contact support')],
    defaultId: 0
  }
  const userChoice = dialog.showMessageBox(null, options)
  if (userChoice === 0) {
    helpWindow = new HelpWM(app, desktop)
    helpWindow.show()
  }
}

const sendErrorToMainWindow = msg => {
  if (msg === COZY_CLIENT_REVOKED_MESSAGE) {
    if (notificationsState.revokedAlertShown) return
    notificationsState.revokedAlertShown = true // prevent the alert from appearing twice
    const options = {
      type: 'warning',
      title: pkg.productName,
      message: translate(
        'Revoked Synchronization with your Cozy is unavailable, maybe you revoked this computer?'
      ),
      detail: translate(
        "Revoked In case you didn't, contact us at contact@cozycloud.cc"
      ),
      buttons: [
        translate('Revoked Reconnect'),
        translate('Revoked Try again later')
      ],
      defaultId: 1
    }
    trayWindow.hide()
    const userChoice = dialog.showMessageBox(null, options)
    if (userChoice === 0) {
      desktop
        .stopSync()
        .then(() => desktop.removeConfig())
        .then(() => log.info('removed'))
        .then(() => trayWindow.doRestart())
        .catch(err => log.error(err))
    } else {
      app.quit()
    }
    return // no notification
  } else if (msg === 'Syncdir has been unlinked') {
    if (notificationsState.syncDirUnlinkedShown) return
    notificationsState.syncDirUnlinkedShown = true // prevent the alert from appearing twice
    const options = {
      type: 'warning',
      title: translate('SyncDirUnlinked Title'),
      message: translate('SyncDirUnlinked You have removed your sync dir.'),
      detail: translate('SyncDirUnlinked The client will restart'),
      buttons: [translate('SyncDirUnlinked Choose Folder')],
      cancelId: 0,
      defaultId: 0
    }
    trayWindow.hide()
    dialog.showMessageBox(null, options)
    desktop
      .stopSync()
      .then(() => desktop.pouch.db.destroy())
      .then(() => {
        desktop.config.syncPath = undefined
      })
      .then(() => desktop.config.persist())
      .then(() => log.info('removed'))
      .then(() => trayWindow.doRestart())
      .catch(err => log.error(err))
    return // no notification
  } else if (msg === 'Cozy is full' || msg === 'No more disk space') {
    msg = translate('Error ' + msg)
    trayWindow.send('sync-error', msg)
  } else if (msg === 'Syncdir is empty') {
    trayWindow.send('sync-error', translate('SyncDirEmpty Title'))
    const options = {
      type: 'warning',
      title: translate('SyncDirEmpty Title'),
      message: translate('SyncDirEmpty Message'),
      detail: translate('SyncDirEmpty Detail'),
      buttons: [translate('AppMenu Close')]
    }
    dialog.showMessageBox(null, options)
    desktop.stopSync().catch(err => log.error(err))
    return // no notification
  } else {
    msg = translate('Dashboard Synchronization incomplete')
    trayWindow.send('sync-error', msg)
  }

  if (notificationsState.notifiedMsg !== msg) {
    notificationsState.notifiedMsg = msg
    new Notification({ title: 'Cozy Drive', body: msg }).show()
  }
}

const SYNC_STATUS_DELAY = 1000 // milliseconds
let syncStatusTimeout = null
const updateState = (newState, data) => {
  if (newState === 'error') errorMessage = data
  if (newState === 'online' && state !== 'offline') return
  if (newState === 'offline' && state === 'error') return

  clearTimeout(syncStatusTimeout)
  if (newState === 'online') {
    tray.setState('up-to-date')
    trayWindow.send('up-to-date')
  } else if (newState === 'offline') {
    tray.setState('offline')
    trayWindow.send('offline')
  } else if (newState === 'error') {
    tray.setState('error', data)
    sendErrorToMainWindow(data)
  } else if (newState === 'sync-status' && data && data.label === 'sync') {
    tray.setState('syncing')
    trayWindow.send('sync-status', data)
  } else if (newState === 'syncing' && data && data.filename) {
    tray.setState('syncing', data)
    trayWindow.send('transfer', data)
  } else if (newState === 'sync-status') {
    syncStatusTimeout = setTimeout(async () => {
      const upToDate = data && data.label === 'uptodate'
      tray.setState(upToDate ? 'up-to-date' : 'syncing')
      trayWindow.send('sync-status', data)
      if (upToDate) {
        try {
          await desktop.remote.updateLastSync()
          log.debug('last sync updated')
        } catch (err) {
          log.warn({ err }, 'could not update last sync date')
        }
      }
    }, SYNC_STATUS_DELAY)
  }

  if (newState === 'sync-status') {
    state = data.label === 'uptodate' ? 'up-to-date' : 'syncing'
  } else {
    state = newState
  }
}

const addFile = async info => {
  const file = {
    filename: path.basename(info.path),
    path: info.path,
    icon: selectIcon(info),
    size: info.size || 0,
    updated: +new Date()
  }
  updateState('syncing', file)
  await lastFiles.add(file)
  await lastFiles.persist()
}

const removeFile = async info => {
  const file = {
    filename: path.basename(info.path),
    path: info.path,
    icon: '',
    size: 0,
    updated: 0
  }
  updateState('syncing')
  trayWindow.send('delete-file', file)
  await lastFiles.remove(file)
  await lastFiles.persist()
}

const sendDiskUsage = () => {
  if (diskTimeout) {
    clearTimeout(diskTimeout)
    diskTimeout = null
  }
  if (trayWindow) {
    diskTimeout = setTimeout(sendDiskUsage, 10 * 60 * 1000) // every 10 minutes
    desktop.diskUsage().then(
      res => {
        const space = {
          used: +res.attributes.used,
          quota: +(res.attributes.quota || 0)
        }
        trayWindow.send('disk-space', space)
      },
      err => log.error(err)
    )
  }
}

const startSync = async () => {
  updateState('syncing')
  desktop.events.on('sync-status', status => {
    updateState('sync-status', status)
  })
  desktop.events.on('online', () => {
    updateState('online')
  })
  desktop.events.on('offline', () => {
    updateState('offline')
  })
  desktop.events.on('remoteWarnings', warnings => {
    if (warnings.length > 0) {
      trayWindow.send('remoteWarnings', warnings)
    } else if (userActionRequired) {
      log.info('User action complete.')
      trayWindow.doRestart()
    }
  })
  desktop.events.on('transfer-started', addFile)
  desktop.events.on('transfer-copy', addFile)
  desktop.events.on('transfer-move', (info, old) => {
    addFile(info)
    removeFile(old)
  })
  const notifyIncompatibilities = debounce(
    incompatibilities => {
      sendErrorToMainWindow(incompatibilitiesErrorMessage(incompatibilities))
    },
    5000,
    { leading: true }
  )
  desktop.events.on('platform-incompatibilities', incompatibilitiesList => {
    incompatibilitiesList.forEach(incompatibilities => {
      notifyIncompatibilities(incompatibilities)
    })
  })
  desktop.events.on('syncdir-unlinked', () => {
    sendErrorToMainWindow('Syncdir has been unlinked')
  })
  desktop.events.on('delete-file', removeFile)

  desktop.events.on('sync-error', err => {
    if (err.status === 402) {
      // Only show notification popup on the first check (the GUI will
      // include a warning anyway).
      if (!userActionRequired) UserActionRequiredDialog.show(err)

      userActionRequired = pick(err, [
        'title',
        'code',
        'detail',
        'links',
        'message'
      ])
      trayWindow.send('user-action-required', userActionRequired)
      desktop.remote.warningsPoller.switchMode('medium')
      return
    } else {
      updateState('error', err.message)
    }
    sendDiskUsage()
  })

  desktop.startSync()
  sendDiskUsage()

  autoLaunch.isEnabled().then(enabled => {
    trayWindow.send('auto-launch', enabled)
  })
}

const dumbhash = k =>
  k.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0)

const openMarkdownViewer = (filename, content, banner = null) => {
  return new Promise(resolve => {
    let viewerWindow = new MarkdownViewerWindow(app, desktop)
    viewerWindow
      .show()
      .then(() => viewerWindow.loadContent(filename, content, banner))
    viewerWindow.on('closed', () => {
      viewerWindow = null
      resolve()
    })
  })
}

const openNote = async filePath => {
  if (!(await fse.pathExists(filePath))) return false

  try {
    await notes.openNote(filePath, { shell, desktop })
  } catch (err) {
    try {
      const content = await fse.readFile(filePath, 'utf8')
      let banner
      switch (err.name) {
        case 'CozyDocumentMissingError':
          banner = {
            level: 'error',
            title: translate('Error This note could not be found'),
            details: translate(
              "Error Check that the note still exists either on your Cozy or its owner's." +
                ' This could also mean that the note is out of sync.'
            )
          }
          break
        case 'UnreachableError':
          banner = {
            level: 'info',
            title: translate('Error Your Cozy is unreachable'),
            details: translate(
              'Error Are you connected to the Internet?' +
                ' You can nevertheless read the content of your note below in degraded mode.'
            )
          }
          break
        default:
          banner = {
            level: 'error',
            title: translate('Error Unexpected error'),
            details: `${err.name}: ${err.message}`
          }
      }
      await openMarkdownViewer(path.basename(filePath), content, banner)
      return true
    } catch (err) {
      log.error(
        { err, path: filePath, filePath },
        'Could not display markdown content of note'
      )

      dialog.showMessageBox(null, {
        type: 'error',
        message: translate('Error Unexpected error'),
        details: `${err.name}: ${err.message}`,
        buttons: [translate('AppMenu Close')]
      })

      return false
    }
  }
  return true
}

/* This event is emitted inside the primary instance and is guaranteed to be
 * emitted after the `ready` event of `app` gets emitted.
 *
 * @see https://www.electronjs.org/docs/api/app#event-second-instance
 *
 * This means we can be sure that `desktop` will be assigned and setup at some
 * point.
 * To avoid race conditions, we'll wait for that setup to be done.
 */
app.on('second-instance', async (event, argv) => {
  try {
    await whenDesktopReady
  } catch (err) {
    return
  }

  if (argv && argv.length > 2) {
    const filePath = argv[argv.length - 1]
    log.info({ filePath }, 'second instance invoked with arguments')

    // If we found a note to open, stop here. Otherwise, show main window.
    if (await openNote(filePath)) return
  }

  // Make sure the main window exists before trying to show it
  if (trayWindow) showWindow()
})

/* macOS only.
 *
 * This will be used to store promises that resolve once each open note request
 * has been fulfilled either by displaying it in the browser or displaying the
 * markdown viewer and closing the window.
 */
const openedNotes = []

/* macOS only.
 *
 * @see https://www.electronjs.org/docs/api/app?q=ope#event-open-file-macos
 *
 * Per the `electron` documentation, we should listen for this event as soon as
 * possible, even before the `ready` event is emitted to handle the case where a
 * file is dropped onto the dock icon.
 *
 * However, we have the same requirement around the setup of `desktop`
 * than for the `second-instance` event listener so we'll wait for that setup to
 * be done.
 */
app.on('open-file', async (event, filePath) => {
  // If the app was invoked with a file path, `open-file` is triggered before
  // `ready`. This means the app is not ready at this time.
  // Since we just want to open a note, not start the Sync, we'll want to quit
  // the app when all opened notes will be closed.
  const noSync = openedNotes.length === 0 && !app.isReady()
  if (noSync) preventSyncStart()

  log.info({ filePath }, 'open-file invoked')
  event.preventDefault()

  try {
    await whenDesktopReady
  } catch (err) {
    return
  }

  openedNotes.push(openNote(filePath))
  if (await Promise.all(openedNotes)) {
    if (noSync) {
      log.info('all notes are closed. Quitting app')
      app.quit()
    }
    return
  }

  // If note could not be opened, display the main window.
  // Make sure it exists before trying to show it.
  if (trayWindow) showWindow()
})

app.on('ready', async () => {
  // Once configured and running in the tray, the app doesn't need to be
  // visible anymore in macOS dock (and cmd+tab), even when the tray popover
  // is visible, until another window shows up.
  if (process.platform === 'darwin') app.dock.hide()

  const { session } = require('electron')

  const hostID = (dumbhash(os.hostname()) % 4096).toString(16)
  let userAgent = `Cozy-Desktop-${process.platform}-${pkg.version}-${hostID}`
  await proxy.setup(app, proxy.config(), session, userAgent, async () => {
    log.info('Loading CLI...')
    i18n.init(app)
    try {
      desktop = new Desktop.App(process.env.COZY_DESKTOP_DIR)
    } catch (err) {
      if (err.message.match(/GLIBCXX/)) {
        dialog.showMessageBox(null, {
          type: 'error',
          message: translate('Error Bad GLIBCXX version'),
          buttons: [translate('AppMenu Close')]
        })
        app.quit()
        return
      } else throw err
    }

    // We need a valid config to start the App and open the requested note.
    // We assume users won't have notes they want to open without a connected
    // client.
    if (desktop.config.syncPath) {
      await setupDesktop()

      if (process.argv && process.argv.length > 2) {
        const { argv } = process
        const filePath = argv[argv.length - 1]
        log.info({ filePath }, 'main instance invoked with arguments')

        // If we found a note to open, stop here. Otherwise, start sync app.
        if (await openNote(filePath)) {
          app.quit()
          return
        }
      }
    }

    if (shouldStartSync) {
      tray.init(app, toggleWindow)
      lastFiles.init(desktop)
      log.trace('Setting up tray WM...')
      trayWindow = new TrayWM(app, desktop)
      log.trace('Setting up help WM...')
      helpWindow = new HelpWM(app, desktop)
      log.trace('Setting up onboarding WM...')
      onboardingWindow = new OnboardingWM(app, desktop)
      onboardingWindow.onOnboardingDone(async () => {
        await setupDesktop()
        onboardingWindow.hide()
        trayWindow.show().then(() => startSync())
      })
      if (app.isPackaged) {
        log.trace('Setting up updater WM...')
        updaterWindow = new UpdaterWM(app, desktop)
        updaterWindow.onUpToDate(() => {
          updaterWindow.hide()
          startApp()
        })
        updaterWindow.checkForUpdates()
        setInterval(() => {
          updaterWindow.checkForUpdates()
        }, DAILY)
      } else {
        startApp()
      }

      // Os X wants all application to have a menu
      Menu.setApplicationMenu(buildAppMenu(app))

      // On OS X it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      app.on('activate', showWindow)
    }
  })
})

// Don't quit the app when all windows are closed, keep the tray icon
// See http://electron.atom.io/docs/api/app/#event-window-all-closed
app.on('window-all-closed', () => {
  log.debug('All windows closed. Keep running in tray...')
})

ipcMain.on('show-help', () => {
  helpWindow.show()
})

ipcMain.on('userActionInProgress', () => {
  desktop.remote.warningsPoller.switchMode('fast')
})

// On watch mode, automatically reload the window when sources are updated
if (process.env.WATCH === 'true') {
  const chokidar = require('chokidar')
  chokidar.watch(['*.{html,js,css}'], { cwd: __dirname }).on('change', () => {
    if (updaterWindow) {
      updaterWindow.reload()
    } else if (trayWindow) {
      trayWindow.reload()
    }
  })
}
