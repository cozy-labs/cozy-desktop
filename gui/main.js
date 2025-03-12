'use strict'

require('../core/globals')

// Initialize `remote` module so that renderer processes can use it.
require('@electron/remote/main').initialize()
const os = require('os')
const path = require('path')

const async = require('async')
const {
  app,
  Menu,
  Notification,
  ipcMain,
  dialog,
  powerMonitor,
  session
} = require('electron')

if (process.env.INSECURE_SSL) {
  app.commandLine.appendSwitch('ignore-certificate-errors')
}

const Desktop = require('../core/app.js')
const { exit, restart } = require('./js/actions')
const { buildAppMenu } = require('./js/appmenu')
const autoLaunch = require('./js/autolaunch')
const { fileInfo } = require('./js/fileutils')
const HelpWM = require('./js/help.window.js')
const i18n = require('./js/i18n')
const lastFiles = require('./js/lastfiles')
const OnboardingWM = require('./js/onboarding.window.js')
const tray = require('./js/tray')
const TrayWM = require('./js/tray.window.js')
const UpdaterWM = require('./js/updater.window.js')
const { openNote } = require('./utils/notes')
const config = require('../core/config')
const {
  SYNC_DIR_EMPTY_MESSAGE,
  SYNC_DIR_UNLINKED_MESSAGE
} = require('../core/local/errors')
const sentry = require('../core/utils/sentry')
const pkg = require('../package.json')
const network = require('./js/network')
const { MigrationFailedError } = require('../core/migrations')
const {
  COZY_CLIENT_REVOKED_CODE,
  COZY_CLIENT_REVOKED_MESSAGE
} = require('../core/remote/errors')
const winRegistry = require('../core/utils/win_registry')
const { translate } = i18n

const DAILY = 3600 * 24 * 1000

// FIXME: https://github.com/electron/electron/issues/10864
if (process.platform === 'win32') app.setAppUserModelId('io.cozy.desktop')

const log = Desktop.logger({
  component: 'GUI'
})
process.on('uncaughtException', err =>
  log.error('uncaught exception', { err, sentry: true })
)

const mainInstance = app.requestSingleInstanceLock()
if (!mainInstance && !process.env.COZY_DESKTOP_PROPERTY_BASED_TESTING) {
  log.warn('Cozy Drive is already running. Exiting...')
  app.exit()
}

let desktop = new Desktop.App(process.env.COZY_DESKTOP_DIR)
sentry.setup(desktop.clientInfo())

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
    // TODO: allow setting desktop up without running migrations (when opening
    // a cozy-note)?
    await desktop.setup()
    desktopIsReady()

    powerMonitor.on('suspend', () => {
      log.info('power suspended')
      desktop.events.emit('power-suspend')
    })
    powerMonitor.on('resume', () => {
      log.info('power resumed')
      desktop.events.emit('power-resume')
    })

    // We do it here since Sentry's setup happens in `desktop.setup()`
    if (process.platform === 'win32') {
      winRegistry.removeOldUninstallKey().catch(err => {
        if (err instanceof winRegistry.RegeditError) {
          log.warn('Failed to remove uninstall registry key', { err })
        }
      })
    }
  } catch (err) {
    log.fatal('Could not setup app', { err, sentry: true })

    desktopIsKO(err)

    if (err instanceof config.InvalidConfigError) {
      await showInvalidConfigError()
    } else if (err instanceof MigrationFailedError) {
      const revokedCozyError = err.errors.find(
        err =>
          err.reason && err.reason.error === 'the client must be registered'
      )
      if (revokedCozyError) {
        return showRevokedCozyError()
      } else {
        await showMigrationError(err)
      }
    } else {
      await dialog.showMessageBox(null, {
        type: 'error',
        message: err.message,
        buttons: [translate('AppMenu Close')]
      })
    }
    await exit(0)
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

const showWindow = async bounds => {
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
      sendDiskUsage()
    }

    try {
      await trayWindow.show(bounds)

      trayWindow.sendSyncConfig()

      const files = await lastFiles.list()
      for (const file of files) {
        trayWindow.send('transfer', { ...file, transferred: file.size })
      }

      const hasAutolaunch = await autoLaunch.isEnabled()
      trayWindow.send('auto-launch', hasAutolaunch)
    } catch (err) {
      log.error('could not show tray window or recent files', { err })
    }
  }
}

const showInvalidConfigError = async () => {
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
  const { response } = await dialog.showMessageBox(null, options)
  if (response === 0) {
    desktop
      .removeConfig()
      .catch(err =>
        log.error('failed disconnecting client', { err, sentry: true })
      )
  } else {
    helpWindow = new HelpWM(app, desktop)
    helpWindow.show()
  }
}

const showMigrationError = async (err /*: Error */) => {
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
  const { response } = await dialog.showMessageBox(null, options)
  if (response === 0) {
    helpWindow = new HelpWM(app, desktop)
    helpWindow.show()
  }
}

const showRevokedCozyError = async () => {
  // prevent the alert from appearing twice
  if (notificationsState.revokedAlertShown) return
  notificationsState.revokedAlertShown = true

  if (trayWindow) trayWindow.hide()
  if (tray.wasInitiated())
    tray.setStatus('error', translate(COZY_CLIENT_REVOKED_MESSAGE))

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

  const { response } = await dialog.showMessageBox(null, options)
  if (response === 0) {
    try {
      await desktop.stopSync()
      await desktop.removeConfig()
      await restart()
    } catch (err) {
      log.error('failed disconnecting client', { err, sentry: true })
    }
  } else {
    await exit(0)
  }
}

// TODO: only send to main window errors that can be displayed within the
// Recent tab and create pop-up methods for the others?
const sendErrorToMainWindow = async ({ msg, code }) => {
  if (code === COZY_CLIENT_REVOKED_CODE) {
    return showRevokedCozyError()
  } else if (msg === SYNC_DIR_UNLINKED_MESSAGE) {
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
    if (trayWindow) trayWindow.hide()
    await dialog.showMessageBox(null, options)
    desktop
      .stopSync()
      .then(() => desktop.pouch.db.destroy())
      .then(() => (desktop.config.syncPath = undefined))
      .then(() => desktop.config.persist())
      .then(() => log.info('Sync dir reset'))
      .then(() => restart())
      .catch(err =>
        log.error('failed disconnecting client', { err, sentry: true })
      )
    return // no notification
  } else if (msg === SYNC_DIR_EMPTY_MESSAGE) {
    trayWindow.send('sync-error', translate('SyncDirEmpty Title'))
    const options = {
      type: 'warning',
      title: translate('SyncDirEmpty Title'),
      message: translate('SyncDirEmpty Message'),
      detail: translate('SyncDirEmpty Detail'),
      buttons: [translate('AppMenu Close')]
    }
    await dialog.showMessageBox(null, options)
    desktop
      .stopSync()
      .catch(err => log.error('failed stopping sync', { err, sentry: true }))
    return // no notification
  }

  if (notificationsState.notifiedMsg !== msg) {
    notificationsState.notifiedMsg = msg
    new Notification({ title: 'Cozy Drive', body: msg }).show()
  }
}

const LAST_SYNC_UPDATE_DELAY = 1000 // milliseconds
let lastSyncTimeout = null
const updateState = async ({ newState, data }) => {
  const { status, filename, userAlerts, errors } = data || {}

  if (newState === 'sync-state') {
    if (status === 'uptodate') tray.setStatus('online')
    else if (status === 'offline') tray.setStatus('offline')
    else if (status === 'error' && errors && errors.length) {
      if (errors[0].code === COZY_CLIENT_REVOKED_CODE) {
        tray.setStatus('error', translate(COZY_CLIENT_REVOKED_MESSAGE))
      } else {
        tray.setStatus(
          'error',
          translate('Dashboard Synchronization impossible')
        )
      }
    } else if (status === 'user-alert' && userAlerts && userAlerts.length)
      tray.setStatus(
        'user-alert',
        translate('Dashboard Synchronization suspended')
      )
    else tray.setStatus('syncing')
  } else if (newState === 'syncing' && filename) {
    tray.setStatus(newState, filename)
  } else {
    // Should not happen as we only call updateState with `syncing` and
    // `sync-state`.
    tray.setStatus(newState)
  }

  if (newState === 'syncing' && filename) {
    trayWindow.send('transfer', data)
  } else if (newState === 'sync-state') {
    clearTimeout(lastSyncTimeout)

    trayWindow.send('sync-state', data)

    if (status === 'uptodate') {
      lastSyncTimeout = setTimeout(async () => {
        try {
          await desktop.remote.updateLastSynced()
          log.debug('last sync updated')
        } catch (err) {
          log.warn('could not update last sync date', { err })
        }
      }, LAST_SYNC_UPDATE_DELAY)
    } else if (status === 'error' && errors && errors.length) {
      // TODO: only send to main window errors that can be displayed within the
      // Recent tab and create pop-up methods for the others?
      if (errors[0].code !== null) {
        await sendErrorToMainWindow({ code: errors[0].code })
      } else {
        await sendErrorToMainWindow({
          msg:
            errors[0].message ||
            translate('Dashboard Synchronization impossible')
        })
      }
    }
  }
}
const updateStateQueue = async.queue(updateState)

const enqueueStateUpdate = (newState, data) => {
  updateStateQueue.pushAsync({ newState, data }).catch(err => {
    log.warn('Failed to update state', { err })
  })
}

const addFile = async info => {
  const file = fileInfo(info)
  enqueueStateUpdate('syncing', file)
  await lastFiles.add(file)
  await lastFiles.persist()
}

const removeFile = async info => {
  const file = {
    filename: path.basename(info.path),
    path: info.path,
    icon: '',
    size: 0,
    updated: 0,
    transferred: 0
  }
  enqueueStateUpdate('syncing')
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
    desktop
      .diskUsage()
      .then(({ used, quota }) => {
        const space = {
          used: +used,
          quota: +(quota || 0)
        }
        trayWindow.send('disk-space', space)
        return space
      })
      .catch(err => log.warn('could not get remote disk usage', { err }))
  }
}

const startSync = async () => {
  enqueueStateUpdate('syncing')
  desktop.events.on('sync-state', state => {
    enqueueStateUpdate('sync-state', state)
  })
  desktop.events.on('transfer-started', doc => {
    const info = fileInfo(doc, { transferred: 0 })
    enqueueStateUpdate('syncing', info)
  })
  desktop.events.on('transfer-progress', (doc, { transferred }) => {
    const info = fileInfo(doc, { transferred })
    enqueueStateUpdate('syncing', info)
  })
  desktop.events.on('transfer-done', doc => {
    const info = fileInfo(doc)
    enqueueStateUpdate('syncing', info)
    addFile(doc)
  })
  desktop.events.on('transfer-failed', doc => {
    const info = fileInfo(doc)
    // XXX: No state update as it will come from a `sync-state` event
    // TODO: find a way to have the old file info take its old place in the list
    // upon overwrite failures.
    // For now, it will be sent back to the Elm app when the main window is
    // displayed again.
    trayWindow.send('delete-file', info)
  })
  desktop.events.on('transfer-move', async (dst, src) => {
    await addFile(dst)
    await removeFile(src)
  })
  desktop.events.on('syncdir-unlinked', () => {
    sendErrorToMainWindow({ msg: SYNC_DIR_UNLINKED_MESSAGE })
  })
  desktop.events.on('delete-file', removeFile)

  desktop.startSync()
  sendDiskUsage()
}

const dumbhash = k =>
  k
    .split('')
    .reduce(
      (a /*: number */, c /*: string */) => ((a << 5) - a + c.charCodeAt(0)) | 0
    )

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
    log.info('second instance invoked with arguments', { filePath })

    // If we found a note to open, stop here. Otherwise, show main window.
    if (filePath.endsWith('.cozy-note')) {
      await openNote(filePath, { desktop })
      return
    } else {
      log.warn('file path argument does not have valid Cozy note extension')
    }
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
  const noSync = !app.isReady()
  if (noSync) preventSyncStart()

  log.info('open-file invoked', { filePath })
  event.preventDefault()

  try {
    await whenDesktopReady
  } catch (err) {
    return
  }

  openedNotes.push(openNote(filePath, { desktop }))
  if (await Promise.all(openedNotes)) {
    if (noSync) {
      log.info('all notes are closed. Quitting app')
      await exit(0)
    }
    return
  }

  // If note could not be opened, display the main window.
  // Make sure it exists before trying to show it.
  if (trayWindow) showWindow()
})

app.on('ready', async () => {
  if (app.commandLine.hasSwitch('ignore-certificate-errors')) {
    const options = {
      type: 'warning',
      title: 'Enable insecure SSL mode?',
      message: 'Are you sure you want to enable insecure SSL?',
      detail: `This mode will skip SSL certificate verification and allow Man-In-the-Middle attacks!\nThis mode is meant for debugging purposes only.\n\nEnable at your own risks if you know what you're doing.`,
      buttons: ['Cancel', 'Enable insecure SSL'],
      defaultId: 0
    }
    const response = dialog.showMessageBoxSync(null, options)
    if (response === 1) {
      // eslint-disable-next-line no-console
      console.warn('!!! INSECURE SSL ENABLED !!!')
      log.warn('!!! INSECURE SSL ENABLED !!!')
    } else {
      exit(0)
    }
  }

  // Once configured and running in the tray, the app doesn't need to be visible
  // anymore in macOS dock (and cmd+tab), even when the tray popover is visible,
  // until another window shows up.
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  const hostID = (dumbhash(os.hostname()) % 4096).toString(16)
  let userAgent = `Cozy-Desktop-${process.platform}-${pkg.version}-${hostID}`
  const { argv } = await network.setup(
    app,
    network.config(),
    session,
    userAgent
  )
  log.info('Loading CLI...')
  i18n.init(app)

  if (desktop.config.syncPath) {
    await setupDesktop()
  }

  if (process.platform !== 'darwin' && argv && argv.length > 2) {
    const filePath = argv[argv.length - 1]
    log.info('main instance invoked with arguments', { filePath, argv })

    // We need a valid config to start the App and open the requested note.
    // We assume users won't have notes they want to open without a connected
    // client.
    if (desktop.config.syncPath) {
      if (filePath.endsWith('.cozy-note')) {
        await openNote(filePath, { desktop })
      } else {
        log.warn('file path argument does not have valid Cozy note extension')
      }
    } else {
      log.warn('no valid config')
    }

    await exit(0)
    return
  }

  if (shouldStartSync) {
    tray.init(app, toggleWindow)
    lastFiles.init(desktop)
    log.trace('Setting up tray WM...')
    trayWindow = new TrayWM(app, desktop, lastFiles)
    log.trace('Setting up help WM...')
    helpWindow = new HelpWM(app, desktop)
    log.trace('Setting up onboarding WM...')
    onboardingWindow = new OnboardingWM(app, desktop)
    onboardingWindow.onOnboardingDone(async () => {
      await setupDesktop()
      onboardingWindow.hide()
      await trayWindow.show()
      await startSync()
    })

    // Os X wants all application to have a menu
    Menu.setApplicationMenu(buildAppMenu(app))

    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    app.on('activate', showWindow)

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
  }
})

// Don't quit the app when all windows are closed, keep the tray icon
// See http://electron.atom.io/docs/api/app/#event-window-all-closed
app.on('window-all-closed', () => {
  log.trace('All windows closed. Keep running in tray...')
})

ipcMain.on('show-help', () => {
  helpWindow.show()
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
