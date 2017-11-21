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
      log.info({update: info}, 'Update available')
      this.send('update-downloading', null)
    })
    autoUpdater.on('update-not-available', (info) => {
      log.info({update: info}, 'No update available')
      this.afterUpToDate()
    })
    autoUpdater.on('error', (err) => {
      log.error({err}, 'Error in auto-updater! ')
      this.afterUpToDate()
    })
    autoUpdater.on('download-progress', (progressObj) => {
      log.trace({progress: progressObj}, 'Downloading...')
      this.send('update-downloading', progressObj)
    })
    autoUpdater.on('update-downloaded', (info) => {
      log.info({update: info}, 'Update downloaded. Exit and install...')
      autoUpdater.quitAndInstall()
    })

    super(...opts)
  }

  onUpToDate (handler) {
    this.afterUpToDate = handler
  }

  show (...opts) {
    let pShown = super.show(...opts)
    log.info('Looking for updates...')
    if (process.platform === 'linux') this.afterUpToDate()
    else autoUpdater.checkForUpdates()
    return pShown
  }

  hash () {
    return '#updater'
  }

  ipcEvents () { return {} }
}
