'use strict'
/* eslint no-unused-vars: [2, { "varsIgnorePattern": "runAsService" }] */

const AutoLaunch = require('cozy-auto-launch')
const Desktop = require('cozy-desktop')
const electron = require('electron')
const fs = require('fs')
const path = require('path')
const {spawn} = require('child_process')

const {app, BrowserWindow, dialog, ipcMain, shell} = electron
const autoLauncher = new AutoLaunch({
  name: 'Cozy-Desktop',
  isHidden: true
})
const desktop = new Desktop(process.env.COZY_DESKTOP_DIR)
const lastFilesPath = path.join(desktop.basePath, 'last-files')
desktop.writeLogsTo(path.join(desktop.basePath, 'logs.txt'))

const locale = (() => {
  const env = process.env
  const envLocale = env.LC_ALL || env.LC_MESSAGES || env.LANG || env.LANGUAGE
  if (envLocale.match(/^fr_/i)) {
    return 'fr'
  } else {
    return 'en'
  }
})()

// Use a fake window to keep the application running when the main window is
// closed: it runs as a service, with a tray icon if you want to quit it
let runAsService

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let tray
let device

let state = 'not-configured'
let errorMessage = ''
let lastFiles = []

const windowOptions = {
  width: 1024,
  height: 768,
  icon: `${__dirname}/images/icon.png`
}

const showWindow = () => {
  if (mainWindow) {
    mainWindow.focus()
  } else {
    createWindow()
  }
}

const sendToMainWindow = (...args) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(...args)
  }
}

const sendErrorToMainWindow = (msg) => {
  if (msg === 'The device is no longer registered' ||
      msg === "This device doesn't exist") {
    sendToMainWindow('unlinked')
  } else {
    sendToMainWindow('sync-error', msg)
  }
}

const goToTab = (tab) => {
  const alreadyShown = !!mainWindow
  showWindow()
  if (alreadyShown) {
    sendToMainWindow('go-to-tab', tab)
  } else {
    mainWindow.webContents.once('dom-ready', () => {
      sendToMainWindow('go-to-tab', tab)
    })
  }
}

const goToMyCozy = () => {
  const device = desktop.config.getDevice()
  shell.openExternal(device.url)
}

const openCozyFolder = () => {
  const device = desktop.config.getDevice()
  shell.openItem(device.path)
}

const setTrayIcon = (state) => {
  if (process.platform === 'darwin') {
    tray.setImage(`${__dirname}/images/tray-icon-osx/${state}Template.png`)
    tray.setPressedImage(`${__dirname}/images/tray-icon-osx/${state}Highlight.png`)
  } else {
    tray.setImage(`${__dirname}/images/tray-icon-linux/${state}.png`)
  }
}

const updateState = (newState, filename) => {
  state = newState
  let statusLabel = ''
  if (state === 'error') {
    setTrayIcon('error')
    statusLabel = errorMessage = filename
  } else if (filename) {
    setTrayIcon('sync')
    statusLabel = `Syncing ‟${filename}“`
  } else if (state === 'up-to-date' || state === 'online') {
    setTrayIcon('idle')
    statusLabel = 'Your cozy is up to date'
  } else if (state === 'syncing') {
    setTrayIcon('sync')
    statusLabel = 'Syncing…'
  } else if (state === 'offline') {
    setTrayIcon('pause')
    statusLabel = 'Offline'
  }
  const menu = electron.Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Open Cozy folder', click: openCozyFolder },
    { label: 'Go to my Cozy', click: goToMyCozy },
    { type: 'separator' },
    { label: 'Help', click: goToTab.bind(null, 'help') },
    { label: 'Settings', click: goToTab.bind(null, 'settings') },
    { type: 'separator' },
    { label: 'Quit application', click: app.quit }
  ])
  if (state === 'error') {
    menu.insert(2, new electron.MenuItem({
      label: 'Relaunch synchronization', click: startSync
    }))
  }
  tray.setContextMenu(menu)
  tray.setToolTip(statusLabel)
}

const selectIcon = (info) => {
  if (['image', 'video'].indexOf(info.class) !== -1) {
    return info.class
  } else if (info.class === 'music') {
    return 'audio'
  } else if (info.mime === 'application/pdf') {
    return 'pdf'
  } else if (info.mime === 'application/x-binary') {
    return 'binary'
  } else if (!info.mime) {
    return 'file'
  } else if (info.mime.match(/[/-][bg]?zip2?$/)) {
    return 'archive'
  } else if (info.mime.match(/^(text|application)\/(html|xml)/)) {
    return 'code'
  } else if (info.mime.match(/^text\//)) {
    return 'text'
  } else if (info.mime.match(/^application\/.*rtf/)) {
    return 'text'
  } else if (info.mime.match(/word/)) {
    return 'text'
  } else if (info.mime.match(/powerpoint/)) {
    return 'presentation'
  } else if (info.mime.match(/excel/)) {
    return 'spreadsheet'
  }
  return 'file'
}

const loadLastFiles = () => {
  fs.readFile(lastFilesPath, 'utf-8', (err, data) => {
    if (!err && data) {
      try {
        lastFiles = JSON.parse(data)
      } catch (err) {}
    }
  })
}

const persistLastFiles = () => {
  const data = JSON.stringify(lastFiles)
  fs.writeFile(lastFilesPath, data, (err) => {
    if (err) {
      console.log(err)
    }
  })
}

const addFile = (info) => {
  const file = {
    filename: path.basename(info.path),
    path: info.path,
    icon: selectIcon(info),
    size: info.size,
    updated: +new Date()
  }
  updateState('syncing', file.filename)
  lastFiles.push(file)
  lastFiles = lastFiles.slice(-250)
  sendToMainWindow('transfer', file)
  persistLastFiles()
}

const removeFile = (info) => {
  const file = {
    filename: path.basename(info.path),
    path: info.path,
    icon: '',
    size: 0,
    updated: 0
  }
  lastFiles = lastFiles.filter((f) => f.path !== file.path)
  sendToMainWindow('delete-file', file)
  persistLastFiles()
}

const sendDiskSpace = () => {
  if (mainWindow) {
    desktop.getDiskSpace((err, res) => {
      if (err) {
        console.error(err)
      } else {
        const space = {
          used: +res.diskSpace.usedDiskSpace,
          usedUnit: res.diskSpace.usedUnit,
          total: +res.diskSpace.totalDiskSpace,
          totalUnit: res.diskSpace.totalUnit
        }
        sendToMainWindow('disk-space', space)
      }
    })
  }
}

const startSync = () => {
  sendToMainWindow('synchronization', device.url)
  for (let file of lastFiles) {
    sendToMainWindow('transfer', file)
  }
  if (desktop.sync) {
    if (state === 'up-to-date' || state === 'online') {
      sendToMainWindow('up-to-date')
    } else if (state === 'offline') {
      sendToMainWindow('offline')
    } else if (state === 'error') {
      sendErrorToMainWindow(errorMessage)
    }
  } else {
    updateState('syncing')
    desktop.events.on('up-to-date', () => {
      updateState('up-to-date')
      sendToMainWindow('up-to-date')
    })
    desktop.events.on('online', () => {
      updateState('online')
      sendToMainWindow('up-to-date')
    })
    desktop.events.on('offline', () => {
      updateState('offline')
      sendToMainWindow('offline')
    })
    desktop.events.on('transfer-started', addFile)
    desktop.events.on('transfer-copy', addFile)
    desktop.events.on('transfer-move', (info, old) => {
      addFile(info)
      removeFile(old)
    })
    desktop.events.on('delete-file', removeFile)
    desktop.synchronize('full', (err) => {
      const msg = (err && err.message) || 'stopped'
      if (err) {
        console.error(err)
        updateState('error', msg)
        sendDiskSpace()
      }
      sendErrorToMainWindow(msg)
    })
    sendDiskSpace()
    setInterval(sendDiskSpace, 10 * 60 * 1000)  // every 10 minutes
  }
  autoLauncher.isEnabled().then((enabled) => {
    sendToMainWindow('auto-launch', enabled)
  })
}

const createWindow = () => {
  runAsService = new BrowserWindow({ show: false })
  mainWindow = new BrowserWindow(windowOptions)
  mainWindow.loadURL(`file://${__dirname}/index.html`)
  if (process.env.WATCH === 'true' || process.env.DEBUG === 'true') {
    mainWindow.setBounds({ x: 0, y: 0, width: 1600, height: 768 })
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.setMenu(null)
  }
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('dom-ready', () => {
    sendToMainWindow('locale', locale)
    if (desktop.config.hasDevice()) {
      device = desktop.config.getDevice()
      if (device.deviceName && device.url && device.path) {
        setTimeout(startSync, 20)
      }
    }
  })
}

loadLastFiles()

app.on('ready', () => {
  if (process.argv.indexOf('--hidden') === -1) {
    createWindow()
  }
  tray = new electron.Tray(`${__dirname}/images/tray-icon-linux/idle.png`)
  setTrayIcon('idle')
  const menu = electron.Menu.buildFromTemplate([
    { label: 'Show application', click: showWindow },
    { label: 'Quit application', click: app.quit }
  ])
  tray.setContextMenu(menu)
  tray.on('click', showWindow)
})

// On OS X it's common to re-create a window in the app when the
// dock icon is clicked and there are no other windows open.
app.on('activate', showWindow)

// Glue code between cozy-desktop lib and the renderer process
ipcMain.on('ping-cozy', (event, url) => {
  desktop.pingCozy(url, (err, cozyUrl) => {
    let pong = null
    if (!err) {
      pong = cozyUrl
    }
    event.sender.send('cozy-pong', pong)
  })
})

ipcMain.on('register-remote', (event, arg) => {
  desktop.askPassword = (cb) => { cb(null, arg.password) }

  // It looks like Electron detects incorrectly that node has nothing to do
  // and it prevents it to send its http request to the cozy before the next
  // event. Putting new events in the event loop seems to be a work-around
  // for this mysterious bug!
  setTimeout(() => {}, 250)
  setTimeout(() => {}, 500)
  setTimeout(() => {}, 1000)

  desktop.registerRemote(arg.url, null, (err, credentials) => {
    event.sender.send('remote-registered', err)
    if (!err) {
      device = {
        url: arg.url,
        deviceName: credentials.deviceName,
        password: credentials.password
      }
    }
  })
})

ipcMain.on('choose-folder', (event) => {
  let folders = dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (folders && folders.length > 0) {
    event.sender.send('folder-chosen', folders[0])
  }
})

ipcMain.on('start-sync', (event, arg) => {
  if (!device) {
    console.error('No device!')
    return
  }
  desktop.saveConfig(device.url, arg, device.deviceName, device.password)
  startSync()
})

ipcMain.on('auto-launcher', (event, enabled) => {
  autoLauncher.isEnabled().then((was) => {
    if (was === enabled) {
      return
    } else if (enabled) {
      autoLauncher.enable()
    } else {
      autoLauncher.disable()
    }
  })
})

ipcMain.on('unlink-cozy', () => {
  if (!device) {
    console.error('No device!')
    return
  }
  desktop.stopSync(() => {
    if (!device) {
      return
    }
    desktop.askPassword = (cb) => { cb(null, device.password) }
    desktop.removeRemote(device.deviceName, (err) => {
      if (err) {
        console.error(err)
      } else {
        device = null
        sendToMainWindow('unlinked')
      }
    })
  })
})

ipcMain.on('send-mail', (event, body) => {
  desktop.sendMailToSupport(body, (err) => {
    event.sender.send('mail-sent', err)
  })
})

ipcMain.on('restart', () => {
  setTimeout(app.quit, 500)
  const args = process.argv.slice(1).filter(a => a !== '--isHidden')
  spawn(process.argv[0], args)
})

// On watch mode, automatically reload the window when sources are updated
if (process.env.WATCH === 'true') {
  const chokidar = require('chokidar')
  chokidar.watch(['*.{html,js,css}'], { cwd: __dirname })
    .on('change', () => {
      if (mainWindow) {
        mainWindow.reload()
      }
    })
}
