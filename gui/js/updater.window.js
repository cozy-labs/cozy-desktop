/* @flow */

const Promise = require('bluebird')
const WindowManager = require('./window_manager')
const { autoUpdater } = require('electron-updater')
const { translate } = require('./i18n')
const { dialog } = require('electron')
const path = require('path')
const { enable: enableRemoteModule } = require('@electron/remote/main')

/*::
import type { App as ElectronApp } from 'electron'
import type { App as CoreApp } from '../../core/app'
*/

const log = require('../../core/app').logger({
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
const UPDATE_CHECK_TIMEOUT = 10000
const UPDATE_RETRY_DELAY = 1000
const UPDATE_RETRIES = 5

module.exports = class UpdaterWM extends WindowManager {
  /*::
  retriesLeft: number
  */

  windowOptions() {
    return {
      title: 'UPDATER',
      width: 500,
      height: 400
    }
  }

  create() {
    super.create()

    enableRemoteModule(this.win.webContents)
  }

  humanError(err /*: ErrnoError */) {
    switch (err.code) {
      case 'EPERM':
        return translate('Updater Error EPERM')
      case 'ENOSP':
        return translate('Updater Error ENOSPC')
      default:
        return translate('Updater Error Other')
    }
  }

  constructor(...opts /*: { app: ElectronApp, desktop: CoreApp } */) {
    super(...opts)

    autoUpdater.logger = log
    autoUpdater.autoDownload = false
    autoUpdater.on('update-available', info => {
      this.clearTimeoutIfAny()
      log.info('Update available', { update: info, skipped: this.skipped })
      // Make sure UI doesn't show up after timeout
      if (!this.skipped) {
        const shouldUpdate =
          dialog.showMessageBoxSync({
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
      log.info('No update available', { update: info })
      this.afterUpToDate()
    })
    autoUpdater.on('error', async err => {
      if (this.skipped) {
        return
      } else if (err.code === 'ENOENT') {
        this.skipUpdate('assuming development environment')
      } else if (this.retriesLeft > 0) {
        this.retriesLeft--
        await Promise.delay(UPDATE_RETRY_DELAY)
        await autoUpdater.checkForUpdates()
      } else {
        this.retriesLeft = UPDATE_RETRIES
        this.skipUpdate(err.message)
      }
    })
    autoUpdater.on('download-progress', progressObj => {
      log.trace('Downloading...', { progress: progressObj })
      this.send('update-downloading', progressObj)
    })
    autoUpdater.on('update-downloaded', info => {
      log.info('Update downloaded. Exit and install...', { update: info })
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

    this.retriesLeft = UPDATE_RETRIES
  }

  clearTimeoutIfAny() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }

  onUpToDate(handler /*: any */) {
    this.afterUpToDate = () => {
      this.clearTimeoutIfAny()
      handler()
    }
  }

  async checkForUpdates() {
    this.skipped = false
    this.timeout = setTimeout(() => {
      this.skipUpdate(`check is taking more than ${UPDATE_CHECK_TIMEOUT} ms`)
    }, UPDATE_CHECK_TIMEOUT)

    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      // Dealing with the error itself is alreay done via the listener on the
      // `error` event.
      log.error({ err })
    }
  }

  skipUpdate(reason /*: string */) {
    log.info(`Not updating: ${reason}`, { sentry: true })
    this.skipped = true

    // Disable handler & warn on future calls
    const handler = this.afterUpToDate
    this.afterUpToDate = () => {}

    if (typeof handler === 'function') handler()
  }

  hash() {
    return '#updater'
  }

  ipcEvents() {
    return {}
  }
}
