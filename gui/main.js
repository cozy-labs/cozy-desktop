'use strict'

const Desktop = require('cozy-desktop')
const electron = require('electron')
const path = require('path')

const app = electron.app
const BrowserWindow = electron.BrowserWindow
const ipcMain = electron.ipcMain
const desktop = new Desktop(process.env.COZY_DESKTOP_DIR)

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

const createWindow = () => {
  mainWindow = new BrowserWindow({ width: 800, height: 600 })
  mainWindow.loadURL('file://' + path.join(__dirname, 'index.html'))
  mainWindow.webContents.openDevTools()
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

ipcMain.on('add-remote', (event, arg) => {
  console.log('arg', arg)
  desktop.askPassword = (cb) => {
    console.log('askPassword', arg.password)
    cb(null, arg.password)
  }
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
