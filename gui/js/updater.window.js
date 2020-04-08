const Promise = require('bluebird')
const WindowManager = require('./window_manager')
const { autoUpdater } = require('electron-updater')
const { autoUpdaterLogParser } = require('./autoUpdaterLogParser')
const { translate } = require('./i18n')
const { dialog } = require('electron')
const path = require('path')
const { logger } = require('../../core/app')

const log = logger({
  component: 'GUI:autoupdater'
})
const autoUpdaterLogger = logger({
  component: 'GUI:autoupdater'
})

/** The delay starting from the update info request after which it is skipped.
 *
 * Long enough so users with slow connection have chances to start downloading
 * the update before it is skipped (5s was tried but didn't seem sufficient in
 * some cases).
 *
 * App startup could be slower in case GitHub is down exactly at the same
 * time. But the delay still seems acceptable  for an app starting
 * automatically on boot. Even in case it is started by hand.
 *
 * Except for downtimes, users with fast connection should still get a fast
 * available or unavailable update answer anyway.
 */
const UPDATE_CHECK_TIMEOUT = 60000

const UPDATE_RETRY_DELAY = 1000

module.exports = class UpdaterWM extends WindowManager {
  windowOptions() {
    return {
      title: 'UPDATER',
      width: 500,
      height: 400
    }
  }

  humanError(err) {
    switch (err.code) {
      case 'EPERM':
        return translate('Updater Error EPERM')
      case 'ENOSP':
        return translate('Updater Error ENOSPC')
      default:
        return translate('Updater Error Other')
    }
  }

  constructor(...opts) {
    super(...opts)

    this.progressObj = {
      percent: 0,
      bytesPerSecond: 0,
      total: 0,
      transferred: 0,
      lastChunkStartTime: 0
    }

    autoUpdaterLogger.addSerializers({
      msg: msg => {
        try {
          const progress = autoUpdaterLogParser(msg)
          this.updateDownloadProgress(progress)
        } catch (err) {
          log.error({ err })
        }
        return msg
      }
    })
    autoUpdater.logger = autoUpdaterLogger
    autoUpdater.autoDownload = false
    autoUpdater.on('update-available', info => {
      this.clearTimeoutIfAny()
      log.info({ update: info, skipped: this.skipped }, 'Update available')
      // Make sure UI doesn't show up after timeout
      if (!this.skipped) {
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
          this.skipUpdate('refused update')
        }
      }
    })
    autoUpdater.on('update-not-available', info => {
      log.info({ update: info }, 'No update available')
      this.afterUpToDate()
    })
    autoUpdater.on('error', async err => {
      if (this.skipped) {
        return
      } else if (err.code === 'ENOENT') {
        this.skipUpdate('assuming development environment')
      } else {
        await Promise.delay(UPDATE_RETRY_DELAY)
        autoUpdater.checkForUpdates()
      }
    })
    autoUpdater.on('download-progress', progressObj => {
      log.trace({ progress: progressObj }, 'Downloading...')
      this.send('update-downloading', progressObj)
    })
    autoUpdater.on('update-downloaded', info => {
      log.info({ update: info }, 'Update downloaded. Exit and install...')
      setImmediate(() =>
        this.desktop
          .stopSync()
          .then(() => this.desktop.pouch.db.close())
          .then(() => autoUpdater.quitAndInstall())
          .then(() => this.app.quit())
          .then(() => this.app.exit(0))
          .catch(err => this.send('error-updating', this.humanError(err)))
      )
    })
  }

  updateDownloadProgress({ totalSize, chunkStart }) {
    if (totalSize) {
      this.progressObj.total = totalSize
    }
    if (chunkStart) {
      const { lastChunkStartTime, transferred, totalSize } = this.progressObj

      const lastChunkDownloadDuration = (Date.now() - lastChunkStartTime) * 1000 // seconds
      const lastChunkEnd = chunkStart - 1
      const downloadedBytes = lastChunkEnd - transferred

      this.progressObj.transferred = lastChunkEnd
      this.progressObj.bytesPerSecond =
        downloadedBytes / lastChunkDownloadDuration
      this.progressObj.percent = (lastChunkEnd * 100) / totalSize
    }

    autoUpdater.emit('download-progress', this.progressObj)
  }

  clearTimeoutIfAny() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }

  onUpToDate(handler) {
    this.afterUpToDate = () => {
      this.clearTimeoutIfAny()
      handler()
    }
  }

  checkForUpdates() {
    this.skipped = false
    this.timeout = setTimeout(() => {
      this.skipUpdate(`check is taking more than ${UPDATE_CHECK_TIMEOUT} ms`)
    }, UPDATE_CHECK_TIMEOUT)
    autoUpdater.checkForUpdates()
  }

  skipUpdate(reason) {
    log.info({ sentry: true }, `Not updating: ${reason}`)
    this.skipped = true

    // Disable handler & warn on future calls
    const handler = this.afterUpToDate
    this.afterUpToDate = () => {}

    handler()
  }

  hash() {
    return '#updater'
  }

  ipcEvents() {
    return {}
  }
}
