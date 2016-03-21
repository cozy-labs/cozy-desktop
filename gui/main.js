'use strict'

const Desktop = require('cozy-desktop')
const electron = require('electron')

const app = electron.app
const BrowserWindow = electron.BrowserWindow
const ipcMain = electron.ipcMain
const desktop = new Desktop(process.env.COZY_DESKTOP_DIR)

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

const createWindow = () => {
  mainWindow = new BrowserWindow({ width: 1024, height: 768 })
  mainWindow.loadURL(`file://${__dirname}/index.html`)
  if (process.env.WATCH === 'true') {
    console.log('WATCH')
    mainWindow.webContents.openDevTools()
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    console.log('Exiting...')
    desktop.stopSync(() => { app.quit() })
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// Glue code between cozy-desktop lib and the renderer process
ipcMain.on('add-remote', (event, arg) => {
  desktop.askPassword = (cb) => { cb(null, arg.password) }
  desktop.addRemote(arg.url, arg.folder, null, (err) => {
    event.sender.send('remote-added', err)
    desktop.synchronize('full', (err) => {
      if (err) {
        console.log(err)
        app.quit()
      }
    })
  })
})

// On watch mode, automatically reload the window when sources are updated
if (process.env.WATCH === 'true') {
  const chokidar = require('chokidar')
  chokidar.watch(['index.html', 'elm.js', 'ports.js', 'styles.css'])
    .on('change', () => {
      if (mainWindow) {
        mainWindow.reload()
      }
    })
}
