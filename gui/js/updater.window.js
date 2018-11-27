const WindowManager = require('./window_manager')
const {autoUpdater} = require('electron-updater')
const {translate} = require('./i18n')
const {dialog} = require('electron')
const path = require('path')

const log = require('../../core/app').logger({
  component: 'GUI:autoupdater'
})

const UPDATE_CHECK_TIMEOUT = 5000

module.exports = class UpdaterWM extends WindowManager {
  windowOptions () {
    return {
      title: 'UPDATER',
      width: 500,
      height: 400
    }
  }

  humanError (err) {
    switch (err.code) {
      case 'EPERM': return translate('Updater Error EPERM')
      case 'ENOSP': return translate('Updater Error ENOSPC')
      default: return translate('Updater Error Other')
    }
  }

  constructor (...opts) {
    autoUpdater.logger = log
    autoUpdater.autoDownload = false
    autoUpdater.on('update-available', (info) => {
      this.clearTimeoutIfAny()
      log.info({update: info, skipped: this.skipped}, 'Update available')
      // Make sure UI don't show up in front of onboarding after timeout
      if (!this.skipped) {
        this.skipped = true
        const shouldUpdate =
          dialog.showMessageBox({
            icon: path.resolve(__dirname, '..', 'images', 'icon.png'),
            title: 'Cozy Drive',
            message: 'Cozy Drive',
            detail: translate(
              'A new version is available, do you want to update?'
            ),
            type: 'question',
            buttons: ['Update', 'Cancel'].map(translate)
          }) === 0
        if (shouldUpdate) {
          autoUpdater.downloadUpdate()
          this.show()
        } else {
          this.skipped = false
        }
      }
    })
    autoUpdater.on('update-not-available', (info) => {
      log.info({update: info}, 'No update available')
      this.afterUpToDate()
    })
    autoUpdater.on('error', (err) => {
      // May also happen in dev because of code signature error. Not an issue.
      log.error({err}, 'Error in auto-updater! ')
      this.clearTimeoutIfAny()
      this.afterUpToDate()
    })
    autoUpdater.on('download-progress', (progressObj) => {
      log.trace({progress: progressObj}, 'Downloading...')
      this.send('update-downloading', progressObj)
    })
    autoUpdater.on('update-downloaded', (info) => {
      log.info({update: info}, 'Update downloaded. Exit and install...')
      setImmediate(() =>
        this.desktop.stopSync()
        .then(() => this.desktop.pouch.db.close())
        .then(() => autoUpdater.quitAndInstall())
        .then(() => this.app.quit())
        .then(() => this.app.exit(0))
        .catch((err) => this.send('error-updating', this.humanError(err)))
      )
    })

    super(...opts)
  }

  clearTimeoutIfAny () {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }

  onUpToDate (handler) {
    this.afterUpToDate = () => {
      this.clearTimeoutIfAny()
      handler()
    }
  }

  checkForUpdates () {
    log.info('Looking for updates...')
    this.timeout = setTimeout(() => {
      log.warn({timeout: UPDATE_CHECK_TIMEOUT}, 'Updates check is taking too long')
      this.skipped = true

      // Disable handler & warn on future calls
      const handler = this.afterUpToDate
      this.afterUpToDate = () => {}

      handler()
    }, UPDATE_CHECK_TIMEOUT)
    autoUpdater.checkForUpdates()
  }

  hash () {
    return '#updater'
  }

  ipcEvents () { return {} }
}
