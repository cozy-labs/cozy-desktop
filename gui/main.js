'use strict'

// Initialize `remote` module so that renderer processes can use it.
require('@electron/remote/main').initialize()

const Desktop = require('../core/app.js')
const { openNote } = require('./utils/notes')
const pkg = require('../package.json')

const path = require('path')
const os = require('os')
const async = require('async')

const proxy = require('./js/proxy')
const {
  COZY_CLIENT_REVOKED_CODE,
  COZY_CLIENT_REVOKED_MESSAGE
} = require('../core/remote/errors')
const {
  SYNC_DIR_EMPTY_MESSAGE,
  SYNC_DIR_UNLINKED_MESSAGE
} = require('../core/local/errors')
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

const { selectIcon } = require('./js/fileutils')
const { buildAppMenu } = require('./js/appmenu')
const i18n = require('./js/i18n')
const { translate } = i18n
const { app, Menu, Notification, ipcMain, dialog } = require('electron')

const DAILY = 3600 * 24 * 1000

// FIXME: https://github.com/electron/electron/issues/10864
if (process.platform === 'win32') app.setAppUserModelId('io.cozy.desktop')

const log = Desktop.logger({
  component: 'GUI'
})
process.on('uncaughtException', err =>
  log.error({ err, sentry: true }, 'uncaught exception')
)

const mainInstance = app.requestSingleInstanceLock()
if (!mainInstance && !process.env.COZY_DESKTOP_PROPERTY_BASED_TESTING) {
  log.warn('Cozy Drive is already running. Exiting...')
  app.exit()
}

let desktop
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
          log.warn({ err }, 'Failed to remove uninstall registry key')
        }
      })
    }
  } catch (err) {
    log.fatal({ err, sentry: true }, 'Could not setup app')

    desktopIsKO(err)

    if (err instanceof config.InvalidConfigError) {
      await showInvalidConfigError()
    } else if (err instanceof migrations.MigrationFailedError) {
      await showMigrationError(err)
    } else {
      await dialog.showMessageBox(null, {
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
        trayWindow.send('transfer', file)
      }

      const hasAutolaunch = await autoLaunch.isEnabled()
      trayWindow.send('auto-launch', hasAutolaunch)
    } catch (err) {
      log.warn({ err }, 'could not show tray window or recent files')
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
      .then(() => log.info('removed'))
      .catch(err =>
        log.error({ err, sentry: true }, 'failed disconnecting client')
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

const sendErrorToMainWindow = async ({ msg, code }) => {
  if (code === COZY_CLIENT_REVOKED_CODE) {
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
    const { response } = await dialog.showMessageBox(null, options)
    if (response === 0) {
      desktop
        .stopSync()
        .then(() => desktop.removeConfig())
        .then(() => log.info('removed'))
        .then(() => trayWindow.doRestart())
        .catch(err =>
          log.error({ err, sentry: true }, 'failed disconnecting client')
        )
    } else {
      app.quit()
    }
    return // no notification
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
    trayWindow.hide()
    await dialog.showMessageBox(null, options)
    desktop
      .stopSync()
      .then(() => desktop.pouch.db.destroy())
      .then(() => {
        desktop.config.syncPath = undefined
      })
      .then(() => desktop.config.persist())
      .then(() => log.info('removed'))
      .then(() => trayWindow.doRestart())
      .catch(err =>
        log.error({ err, sentry: true }, 'failed disconnecting client')
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
      .catch(err => log.error({ err, sentry: true }, 'failed stopping sync'))
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
  const { status, filename, userActions, errors } = data || {}

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
    } else if (
      status === 'user-action-required' &&
      userActions &&
      userActions.length
    )
      tray.setStatus(
        'user-action-required',
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
          await desktop.remote.updateLastSync()
          log.debug('last sync updated')
        } catch (err) {
          log.warn({ err }, 'could not update last sync date')
        }
      }, LAST_SYNC_UPDATE_DELAY)
    } else if (status === 'error' && errors && errors.length) {
      // TODO: get rid of sendErrorToMainWindow and move all error management to
      // main window?
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
const updateStateQueue = Promise.promisifyAll(async.queue(updateState))

const enqueueStateUpdate = (newState, data) => {
  updateStateQueue.pushAsync({ newState, data }).catch(err => {
    log.warn({ err }, 'Failed to update state')
  })
}

const addFile = async info => {
  const file = {
    filename: path.basename(info.path),
    path: info.path,
    icon: selectIcon(info),
    size: info.size || 0,
    updated: +new Date()
  }
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
    updated: 0
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
      .then(res => {
        const space = {
          used: +res.attributes.used,
          quota: +(res.attributes.quota || 0)
        }
        trayWindow.send('disk-space', space)
      })
      .catch(err => log.warn({ err }, 'could not get remote disk usage'))
  }
}

const startSync = async () => {
  enqueueStateUpdate('syncing')
  desktop.events.on('sync-state', state => {
    enqueueStateUpdate('sync-state', state)
  })
  desktop.events.on('transfer-started', addFile)
  desktop.events.on('transfer-copy', addFile)
  desktop.events.on('transfer-move', async (info, old) => {
    await addFile(info)
    await removeFile(old)
  })
  desktop.events.on('syncdir-unlinked', () => {
    sendErrorToMainWindow({ msg: SYNC_DIR_UNLINKED_MESSAGE })
  })
  desktop.events.on('delete-file', removeFile)

  desktop.startSync()
  sendDiskUsage()
}

const dumbhash = k =>
  k.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0)

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
    if (
      filePath.endsWith('.cozy-note') &&
      (await openNote(filePath, { desktop }))
    )
      return
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

  openedNotes.push(openNote(filePath, { desktop }))
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
  // Once configured and running in the tray, the app doesn't need to be visible
  // anymore in macOS dock (and cmd+tab), even when the tray popover is visible,
  // until another window shows up.
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  const { session } = require('electron')

  const hostID = (dumbhash(os.hostname()) % 4096).toString(16)
  let userAgent = `Cozy-Desktop-${process.platform}-${pkg.version}-${hostID}`
  await proxy.setup(app, proxy.config(), session, userAgent)
  log.info('Loading CLI...')
  i18n.init(app)
  try {
    desktop = new Desktop.App(process.env.COZY_DESKTOP_DIR)
  } catch (err) {
    if (err.message.match(/GLIBCXX/)) {
      await dialog.showMessageBox(null, {
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

    const { argv } = process
    if (argv && argv.length > 2) {
      const filePath = argv[argv.length - 1]
      log.info({ filePath, argv }, 'main instance invoked with arguments')

      // If we found a note to open, stop here. Otherwise, start sync app.
      if (
        filePath.endsWith('.cozy-note') &&
        (await openNote(filePath, { desktop }))
      ) {
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

// Don't quit the app when all windows are closed, keep the tray icon
// See http://electron.atom.io/docs/api/app/#event-window-all-closed
app.on('window-all-closed', () => {
  log.debug('All windows closed. Keep running in tray...')
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
