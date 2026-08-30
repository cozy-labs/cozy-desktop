/** Auto-launching the app on session start.
 *
 * @module gui/js/autolaunch
 */

const AutoLaunch = require('auto-launch')
const { app } = require('electron')

const log = require('../../core/app').logger({
  component: 'GUI'
})

const APP_NAME = 'Twake-Desktop'
const NATIVE_PLATFORMS = new Set(['darwin', 'win32'])

class LinuxAutoLauncher {
  constructor({ AutoLaunchClass, appImagePath, logger }) {
    const opts = {
      name: APP_NAME,
      isHidden: true
    }

    if (appImagePath) opts.path = appImagePath

    this.autoLauncher = new AutoLaunchClass(opts)

    if (appImagePath) {
      // `auto-launch` replaces the configured name with the AppImage file name
      // when a path is provided. Keep a stable name so updates do not change
      // the autolaunch entry.
      this.autoLauncher.opts.appName = APP_NAME

      // Refresh the desktop entry so its Exec path follows the current
      // AppImage after an update or move.
      this.ready = this.refresh().catch(err =>
        logger.error('could not refresh AppImage autolaunch entry', { err })
      )
    } else {
      this.ready = Promise.resolve()
    }
  }

  async refresh() {
    if (await this.autoLauncher.isEnabled()) {
      await this.autoLauncher.disable()
      await this.autoLauncher.enable()
    }
  }

  async isEnabled() {
    await this.ready
    return this.autoLauncher.isEnabled()
  }

  async setEnabled(enabled) {
    await this.ready

    if (enabled) {
      await this.autoLauncher.enable()
    } else {
      await this.autoLauncher.disable()
    }

    return enabled
  }
}

class NativeAutoLauncher {
  constructor({ electronApp, logger, platform }) {
    this.app = electronApp
    this.log = logger
    this.platform = platform
  }

  async isEnabled() {
    const settings = this.app.getLoginItemSettings()

    if (this.platform === 'darwin' && settings.status) {
      this.log.debug('macOS autolaunch status', {
        enabled: settings.openAtLogin,
        status: settings.status
      })

      if (settings.status === 'requires-approval') {
        this.log.warn('macOS autolaunch requires user approval')
      }
    }

    return settings.openAtLogin
  }

  async setEnabled(enabled) {
    this.app.setLoginItemSettings({ openAtLogin: enabled })
    return this.isEnabled()
  }
}

class AutoLaunchManager {
  constructor({ autoLauncher, logger }) {
    this.autoLauncher = autoLauncher
    this.log = logger
  }

  async isEnabled() {
    try {
      return await this.autoLauncher.isEnabled()
    } catch (err) {
      this.log.error('could not check autolaunch status', { err })
      return false
    }
  }

  async setEnabled(enabled) {
    try {
      const wasEnabled = await this.autoLauncher.isEnabled()

      if (wasEnabled === enabled) return wasEnabled

      const isEnabled = await this.autoLauncher.setEnabled(enabled)
      this.log.debug(`${isEnabled ? 'Enabled' : 'Disabled'} autolaunch`)
      return isEnabled
    } catch (err) {
      this.log.error('could not set autolaunch', { err })
      return false
    }
  }
}

const createAutoLauncher = ({
  AutoLaunchClass = AutoLaunch,
  appImagePath = process.env.APPIMAGE,
  electronApp = app,
  logger = log,
  platform = process.platform
} = {}) => {
  const autoLauncher = NATIVE_PLATFORMS.has(platform)
    ? new NativeAutoLauncher({ electronApp, logger, platform })
    : new LinuxAutoLauncher({ AutoLaunchClass, appImagePath, logger })

  return new AutoLaunchManager({ autoLauncher, logger })
}

module.exports = createAutoLauncher()
module.exports.createAutoLauncher = createAutoLauncher
