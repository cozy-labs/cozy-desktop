'use strict'

require('babel-polyfill')

const Desktop = require('../core-built/app.js')
const pkg = require('../package.json')

const { debounce, pick } = require('lodash')
const path = require('path')
const os = require('os')

const setupProxy = require('./js/proxy')

const autoLaunch = require('./js/autolaunch')
const lastFiles = require('./js/lastfiles')
const tray = require('./js/tray')
const TrayWM = require('./js/tray.window.js')
const UpdaterWM = require('./js/updater.window.js')
const HelpWM = require('./js/help.window.js')
const OnboardingWM = require('./js/onboarding.window.js')

const {selectIcon} = require('./js/fileutils')
const {buildAppMenu} = require('./js/appmenu')
const i18n = require('./js/i18n')
const {translate} = i18n
const {incompatibilitiesErrorMessage} = require('./js/incompatibilitiesmsg')
const {app, Menu, Notification, ipcMain, dialog} = require('electron')

// FIXME: https://github.com/electron/electron/issues/10864
if (process.platform === 'win32') app.setAppUserModelId('io.cozy.desktop')

const log = Desktop.logger({
  component: 'GUI'
})
process.on('uncaughtException', (err) => log.error(err))

let desktop
let state = 'not-configured'
let errorMessage = ''
let userActionRequired = null
let diskTimeout = null
let onboardingWindow = null
let helpWindow = null
let updaterWindow = null
let trayWindow = null

const toggleWindow = (bounds) => {
  if (trayWindow.shown()) trayWindow.hide()
  else showWindow(bounds)
}

// @TODO facto with showWindow after making args clear with tray position
const showWindowStartApp = () => {
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

const showWindow = (bounds) => {
  if (revokedAlertShown || syncDirUnlinkedShown) return
  if (updaterWindow.shown()) return updaterWindow.focus()
  if (!desktop.config.syncPath) {
    onboardingWindow.show(bounds)
    // registration is done, but we need a syncPath
    if (desktop.config.isValid()) {
      onboardingWindow.jumpToSyncPath()
    }
  } else {
    trayWindow.show(bounds).then(() => startSync())
  }
}

let revokedAlertShown = false
let syncDirUnlinkedShown = false

const sendErrorToMainWindow = (msg) => {
  if (msg === 'Client has been revoked') {
    if (revokedAlertShown) return
    revokedAlertShown = true // prevent the alert from appearing twice
    const options = {
      type: 'warning',
      title: pkg.productName,
      message: translate('Revoked Synchronization with your Cozy is unavailable, maybe you revoked this computer?'),
      detail: translate('Revoked In case you didn\'t, contact us at contact@cozycloud.cc'),
      buttons: [translate('Revoked Log out'), translate('Revoked Try again later')],
      defaultId: 1
    }
    trayWindow.hide()
    const userChoice = dialog.showMessageBox(null, options)
    if (userChoice === 0) {
      desktop.stopSync()
        .then(() => desktop.removeConfig())
        .then(() => log.info('removed'))
        .then(() => trayWindow.doRestart())
        .catch((err) => log.error(err))
    } else {
      app.quit()
    }
    return // no notification
  } else if (msg === 'Syncdir has been unlinked') {
    if (syncDirUnlinkedShown) return
    syncDirUnlinkedShown = true // prevent the alert from appearing twice
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
    desktop.stopSync()
      .then(() => desktop.pouch.db.destroy())
      .then(() => { desktop.config.syncPath = undefined })
      .then(() => desktop.config.persist())
      .then(() => log.info('removed'))
      .then(() => trayWindow.doRestart())
      .catch((err) => log.error(err))
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
      detail: translate('SyncDirEmpty Detail')
    }
    dialog.showMessageBox(null, options)
    desktop.stopSync()
      .catch((err) => log.error(err))
    return // no notification
  } else {
    trayWindow.send('sync-error', msg)
  }
  const notif = new Notification({ title: 'Cozy Drive', body: msg })
  notif.show()
}

const updateState = (newState, filename) => {
  if (newState === 'error') errorMessage = filename
  if (state === 'error' && newState === 'offline') return
  state = newState
  tray.setState(state, filename)
}

const addFile = (info) => {
  const file = {
    filename: path.basename(info.path),
    path: info.path,
    icon: selectIcon(info),
    size: info.size || 0,
    updated: +new Date()
  }
  updateState('syncing', file.filename)
  lastFiles.add(file)
  trayWindow.send('transfer', file)
  lastFiles.persists()
}

const removeFile = (info) => {
  const file = {
    filename: path.basename(info.path),
    path: info.path,
    icon: '',
    size: 0,
    updated: 0
  }
  lastFiles.remove(file)
  trayWindow.send('delete-file', file)
  lastFiles.persists()
}

const sendDiskUsage = () => {
  if (diskTimeout) {
    clearTimeout(diskTimeout)
    diskTimeout = null
  }
  if (trayWindow) {
    diskTimeout = setTimeout(sendDiskUsage, 10 * 60 * 1000)  // every 10 minutes
    desktop.diskUsage().then(
      (res) => {
        const space = {
          used: +res.attributes.used,
          quota: +res.attributes.quota
        }
        trayWindow.send('disk-space', space)
      },
      (err) => log.error(err)
    )
  }
}

const startSync = (force, ...args) => {
  trayWindow.send('synchronization', desktop.config.cozyUrl, desktop.config.deviceName)
  for (let file of lastFiles.list()) {
    trayWindow.send('transfer', file)
  }
  if (desktop.sync && !force) {
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
  } else {
    updateState('syncing')
    desktop.events.on('sync-status', (status) => {
      updateState(status.label === 'uptodate' ? 'online' : 'syncing')
      trayWindow.send('sync-status', status)
    })

    desktop.events.on('online', () => {
      updateState('online')
      trayWindow.send('up-to-date')
    })
    desktop.events.on('offline', () => {
      updateState('offline')
      trayWindow.send('offline')
    })
    desktop.events.on('remoteWarnings', (warnings) => {
      trayWindow.send('remoteWarnings', warnings)
    })
    desktop.events.on('transfer-started', addFile)
    desktop.events.on('transfer-copy', addFile)
    desktop.events.on('transfer-move', (info, old) => {
      addFile(info)
      removeFile(old)
    })
    const notifyIncompatibilities = debounce(
      (incompatibilities) => {
        sendErrorToMainWindow(incompatibilitiesErrorMessage(incompatibilities))
      },
      5000,
      {leading: true}
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
    desktop.synchronize(desktop.config.config.mode)
      .then(() => sendErrorToMainWindow('stopped'))
      .catch((err) => {
        log.error({status: err.status}, 'RIGHT RIGHT HERE')
        if (err.status === 402) {
          userActionRequired = pick(err,
            ['title', 'code', 'detail', 'links', 'message']
          )
          trayWindow.send('user-action-required', userActionRequired)
          return
        }
        updateState('error', err.message)
        sendDiskUsage()
        sendErrorToMainWindow(err.message)
      })
    sendDiskUsage()
  }
  autoLaunch.isEnabled().then((enabled) => {
    trayWindow.send('auto-launch', enabled)
  })
}

const shouldExit = app.makeSingleInstance(() => showWindow())
if (shouldExit) {
  log.warn('Cozy Drive is already running. Exiting...')
  app.exit()
}

const dumbhash = (k) => k.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0)

app.on('ready', () => {
  // Once configured and running in the tray, the app doesn't need to be
  // visible anymore in macOS dock (and cmd+tab), even when the tray popover
  // is visible, until another window shows up.
  if (process.platform === 'darwin') app.dock.hide()

  const {session} = require('electron')

  const hostID = (dumbhash(os.hostname()) % 4096).toString(16)
  let userAgent = `Cozy-Desktop-${process.platform}-${pkg.version}-${hostID}`
  setupProxy(app, session, userAgent, () => {
    log.info('Loading CLI...')
    i18n.init(app)
    try {
      desktop = new Desktop(process.env.COZY_DESKTOP_DIR)
    } catch (err) {
      if (err.message.match(/GLIBCXX/)) {
        dialog.showMessageBox({
          type: 'error',
          message: translate('Error Bad GLIBCXX version')
        })
        app.quit()
        return
      } else throw err
    }
    tray.init(app, toggleWindow)
    lastFiles.init(desktop)
    log.trace('Setting up tray WM...')
    trayWindow = new TrayWM(app, desktop)
    log.trace('Setting up help WM...')
    helpWindow = new HelpWM(app, desktop)
    log.trace('Setting up onboarding WM...')
    onboardingWindow = new OnboardingWM(app, desktop)
    onboardingWindow.onOnboardingDone(() => {
      onboardingWindow.hide()
      trayWindow.show().then(() => startSync())
    })
    log.trace('Setting up updater WM...')
    updaterWindow = new UpdaterWM(app, desktop)
    updaterWindow.onUpToDate(() => {
      updaterWindow.hide()
      showWindowStartApp()
    })
    updaterWindow.checkForUpdates()

    // Os X wants all application to have a menu
    Menu.setApplicationMenu(buildAppMenu(app))

    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    app.on('activate', showWindow)
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

// On watch mode, automatically reload the window when sources are updated
// FIXME: Why does it reload in a new popover with onboarding inside?
if (process.env.WATCH === 'true') {
  const chokidar = require('chokidar')
  chokidar.watch(['*.{html,js,css}'], { cwd: __dirname })
    .on('change', () => {
      if (trayWindow) {
        trayWindow.reload()
      }
    })
}

// Network requests can be stuck with Electron on Linux inside the event loop.
// A hack to deblock them is push some events in the event loop.
// See https://github.com/electron/electron/issues/7083#issuecomment-262038387
// And https://github.com/electron/electron/issues/1833
if (process.platform === 'linux') {
  setInterval(() => {}, 1000)
}
