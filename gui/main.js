'use strict'
/* eslint no-unused-vars: [2, { "varsIgnorePattern": "runAsService" }] */

const Desktop = require('cozy-desktop')
const electron = require('electron')
const path = require('path')

const {app, BrowserWindow, dialog, ipcMain} = electron
const desktop = new Desktop(process.env.COZY_DESKTOP_DIR)

// Use a fake window to keep the application running when the main window is
// closed: it runs as a service, with a tray icon if you want to quit it
let runAsService

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let tray
let device

let state = 'not-configured'
let lastFiles = []

const windowOptions = {
  width: 1024,
  height: 768,
  icon: `${__dirname}/images/icon.png`,
  skipTaskbar: true,
  closable: false
}

const updateState = (newState, filename) => {
  state = newState
  let statusLabel = ''
  if (filename) {
    tray.setImage(`${__dirname}/images/tray-icon/sync.png`)
    statusLabel = `Syncing ‟${filename}“`
  } else if (state === 'up-to-date') {
    tray.setImage(`${__dirname}/images/tray-icon/idle.png`)
    statusLabel = 'Your cozy is up to date'
  } else if (state === 'syncing') {
    tray.setImage(`${__dirname}/images/tray-icon/sync.png`)
    statusLabel = 'Syncing…'
  }
  const menu = electron.Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Help', click: goToTab.bind(null, 'help') },
    { label: 'Settings', click: goToTab.bind(null, 'settings') },
    { type: 'separator' },
    { label: 'Quit application', click: app.quit }
  ])
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

const startSync = (url) => {
  mainWindow.webContents.send('synchronization', url)
  if (desktop.sync) {
    for (let file of lastFiles) {
      mainWindow.webContents.send('transfer', file)
    }
    if (state === 'up-to-date') {
      mainWindow.webContents.send('up-to-date')
    }
  } else {
    updateState('syncing')
    desktop.events.on('up-to-date', () => {
      updateState('up-to-date')
      if (mainWindow) {
        mainWindow.webContents.send('up-to-date')
      }
    })
    desktop.events.on('transfer-started', (info) => {
      const file = {
        filename: path.basename(info.path),
        path: info.path,
        icon: selectIcon(info),
        size: info.size,
        updated: +new Date()
      }
      updateState('syncing', file.filename)
      lastFiles.push(file)
      lastFiles = lastFiles.slice(-5)
      if (mainWindow) {
        mainWindow.webContents.send('transfer', file)
      }
    })
    desktop.events.on('delete-file', (info) => {
      const file = {
        filename: path.basename(info.path),
        path: info.path,
        icon: '',
        size: 0,
        updated: 0
      }
      lastFiles = lastFiles.filter((f) => f.path !== file.path)
      if (mainWindow) {
        mainWindow.webContents.send('delete-file', file)
      }
    })
    desktop.synchronize('full', (err) => { console.error(err) })
  }
}

const createWindow = () => {
  runAsService = new BrowserWindow({ show: false })
  mainWindow = new BrowserWindow(windowOptions)
  mainWindow.loadURL(`file://${__dirname}/index.html`)
  if (process.env.WATCH === 'true') {
    mainWindow.setBounds({ x: 0, y: 0, width: 1600, height: 768 })
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.setMenu(null)
  }
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('dom-ready', () => {
    if (desktop.config.hasDevice()) {
      device = desktop.config.getDevice()
      startSync(device.url)
    }
  })
}

const showWindow = () => {
  if (mainWindow) {
    mainWindow.focus()
  } else {
    createWindow()
  }
}

const goToTab = (tab) => {
  const alreadyShown = !!mainWindow
  showWindow()
  if (alreadyShown) {
    mainWindow.webContents.send('go-to-tab', tab)
  } else {
    mainWindow.webContents.once('dom-ready', () => {
      mainWindow.webContents.send('go-to-tab', tab)
    })
  }
}

app.on('ready', () => {
  createWindow()
  tray = new electron.Tray(`${__dirname}/images/tray-icon/idle.png`)
  const menu = electron.Menu.buildFromTemplate([
    { label: 'Quit application', click: app.quit }
  ])
  tray.setContextMenu(menu)
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
    let message = err
    if (err && err.message) {
      message = err.message
    }
    event.sender.send('remote-registered', message)
    if (!err) {
      device = {
        url: arg.url,
        name: credentials.deviceName,
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
  desktop.saveConfig(device.url, arg, device.name, device.password)
  startSync(device.url)
})

ipcMain.on('unlink-cozy', (event) => {
  if (!device) {
    console.error('No device!')
    return
  }
  desktop.askPassword = (cb) => { cb(null, device.password) }
  desktop.removeRemote(device.deviceName, (err) => {
    if (err) {
      console.error(err)
    } else {
      device = null
      event.sender.send('unlinked')
    }
  })
})

// On watch mode, automatically reload the window when sources are updated
if (process.env.WATCH === 'true') {
  const chokidar = require('chokidar')
  chokidar.watch(['index.html', 'elm.js', 'ports.js', 'styles/app.css'])
    .on('change', () => {
      if (mainWindow) {
        mainWindow.reload()
      }
    })
}
