'use strict'
/* eslint no-unused-vars: [2, { "varsIgnorePattern": "runAsService" }] */

const Desktop = require('cozy-desktop')
const electron = require('electron')

const app = electron.app
const BrowserWindow = electron.BrowserWindow
const dialog = electron.dialog
const ipcMain = electron.ipcMain
const desktop = new Desktop(process.env.COZY_DESKTOP_DIR)

// Use a fake window to keep the application running when the main window is
// closed: it runs as a service, with a tray icon if you want to quit it
let runAsService

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let tray

const windowOptions = {
  width: 1024,
  height: 768,
  icon: `${__dirname}/images/icon.png`,
  skipTaskbar: true,
  closable: false
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
      const cozyUrl = desktop.config.getDevice().url
      mainWindow.webContents.send('synchronization', cozyUrl)
    }
  })
}

app.on('ready', () => {
  createWindow()
  tray = new electron.Tray(`${__dirname}/images/cozystatus-idle.png`)
  const menu = electron.Menu.buildFromTemplate([
    { label: 'Quit', click: app.quit }
  ])
  tray.setContextMenu(menu)
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow) {
    mainWindow.focus()
  } else {
    createWindow()
  }
})

// Glue code between the main and renderer processes
ipcMain.on('choose-folder', (event) => {
  let folders = dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (folders && folders.length > 0) {
    event.sender.send('folder-chosen', folders[0])
  }
})

// Glue code between cozy-desktop lib and the renderer process
let device
ipcMain.on('register-remote', (event, arg) => {
  desktop.askPassword = (cb) => { cb(null, arg.password) }

  // It looks like Electron detects incorrectly that node has nothing to do
  // and it prevents it to send its http request to the cozy before the next
  // event. Putting a new event in the event loop seems to be a work-around
  // for this mysterious bug!
  setTimeout(() => {}, 200)

  desktop.registerRemote(arg.url, null, (err, credentials) => {
    if (err) {
      console.error(err)
    } else {
      event.sender.send('remote-registered', arg.url)
      device = {
        url: arg.url,
        name: credentials.deviceName,
        password: credentials.password
      }
    }
  })
})

ipcMain.on('start-sync', (event, arg) => {
  if (!device) {
    console.error('No device!')
    return
  }
  desktop.saveConfig(device.url, arg, device.name, device.password)
  desktop.synchronize('full', (err) => { console.error(err) })
  event.sender.send('synchronization', device.url)
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
