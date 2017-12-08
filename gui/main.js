'use strict'

require('babel-polyfill')

const Desktop = require('cozy-desktop').default
const notify = require('electron-main-notification')

const debounce = require('lodash.debounce')
const path = require('path')

const setupProxy = require('./src/main/proxy')

const autoLaunch = require('./src/main/autolaunch')
const lastFiles = require('./src/main/lastfiles')
const tray = require('./src/main/tray')
const TrayWM = require('./src/main/tray.window.js')
const UpdaterWM = require('./src/main/updater.window.js')
const HelpWM = require('./src/main/help.window.js')
const OnboardingWM = require('./src/main/onboarding.window.js')

const {selectIcon} = require('./src/main/fileutils')
const {buildAppMenu} = require('./src/main/appmenu')
const i18n = require('./src/main/i18n')
const {translate} = i18n
const {incompatibilitiesErrorMessage} = require('./src/main/incompatibilitiesmsg')
const {app, Menu, ipcMain, dialog} = require('electron')

const log = Desktop.logger({
  component: 'GUI'
})
process.on('uncaughtException', (err) => log.error(err))

let desktop
let state = 'not-configured'
let errorMessage = ''
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
      setTimeout(() => onboardingWindow.send('registration-done'), 20)
    }
  } else {
    startSync()
  }
}

const showWindow = (bounds) => {
  if (updaterWindow.shown()) return updaterWindow.focus()
  if (!desktop.config.syncPath) {
    onboardingWindow.show(bounds)
    // registration is done, but we need a syncPath
    if (desktop.config.isValid()) {
      setTimeout(() => onboardingWindow.send('registration-done'), 20)
    }
  } else {
    trayWindow.show(bounds).then(() => startSync())
  }
}

let revokedAlertShown = false

const sendErrorToMainWindow = (msg) => {
  if (msg === 'Client has been revoked') {
    if (revokedAlertShown) return
    revokedAlertShown = true // prevent the alert from appearing twice
    const options = {
      type: 'warning',
      title: translate('Revoked Title'),
      message: translate('Revoked It looks like you have revoked your client from your Cozy'),
      detail: translate('Revoked If it wasn\'t you, contact us at contact@cozycloud.cc'),
      buttons: [translate('Unlink OK')],
      cancelId: 0,
      defaultId: 0
    }
    dialog.showMessageBox(null, options)
    desktop.stopSync()
      .then(() => desktop.removeConfig())
      .then(() => log.info('removed'))
      .then(() => trayWindow.doRestart())
      .catch((err) => log.error(err))
  } else if (msg === 'Cozy is full' || msg === 'No more disk space') {
    msg = translate('Error ' + msg)
    trayWindow.send('sync-error', msg)
  } else {
    trayWindow.send('sync-error', msg)
  }
  notify('Cozy Drive', { body: msg })
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
    if (state === 'up-to-date' || state === 'online') {
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
    desktop.events.on('delete-file', removeFile)
    desktop.synchronize(desktop.config.config.mode)
      .then(() => sendErrorToMainWindow('stopped'))
      .catch((err) => {
        log.error(err)
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

const shouldExit = app.makeSingleInstance(showWindow)
if (shouldExit) {
  log.warn('Cozy Drive is already running. Exiting...')
  app.exit()
}

app.on('ready', () => {
  // Once configured and running in the tray, the app doesn't need to be
  // visible anymore in macOS dock (and cmd+tab), even when the tray popover
  // is visible, until another window shows up.
  if (process.platform === 'darwin') app.dock.hide()

  const {session} = require('electron')
  setupProxy(app, session, () => {
    log.info('Loading CLI...')
    desktop = new Desktop(process.env.COZY_DESKTOP_DIR)
    i18n.init(app)
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
