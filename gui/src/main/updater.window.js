const WindowManager = require('./window_manager')
const {autoUpdater} = require('electron-updater')

const log = require('cozy-desktop').default.logger({
  component: 'GUI:autoupdater'
})

module.exports = class UpdaterWM extends WindowManager {
  windowOptions () {
    return {
      title: 'UPDATER',
      width: 500,
      height: 500
    }
  }

  constructor (...opts) {

    autoUpdater.on('update-available', (info) => {
      console.log("UA")
      this.send('update-downloading', null)
    })
    autoUpdater.on('update-not-available', (info) => {
      console.log("UTO")
      this.afterUpToDate()
    })
    autoUpdater.on('error', (err) => {
      console.log("ERROR")
      this.log.error('Error in auto-updater. ' + err)
      this.afterUpToDate()
    })
    autoUpdater.on('download-progress', (progressObj) => {
      console.log("DP")
      this.send('update-downloading', progressObj)
    })
    autoUpdater.on('update-downloaded', (info) => {
      console.log("DOWNDONE")
      autoUpdater.quitAndInstall()
    })

    try {
      super(...opts)
    } catch (err) { console.log(err) }
  }

  onUpToDate (handler) {
    console.log("SETHANDLER")
    this.afterUpToDate = handler
  }

  show (...opts) {
    let pShown = super.show(...opts)
    console.log("CHECK FOR UPDATES")
    autoUpdater.checkForUpdates()
    return pShown
  }

  hash () {
    return '#updater'
  }

  ipcEvents () { return {} }
}
