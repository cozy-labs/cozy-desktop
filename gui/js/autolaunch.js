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

class AppImageAutoLauncher {
  constructor() {
    this.autoLauncher = new AutoLaunch({
      name: APP_NAME,
      path: process.env.APPIMAGE
    })

    // Fix issue with `auto-launch` that uses the path instead of the app name
    // when defining the autolaunch entry leading to autolaunch to stop working
    // after an app update.
    // See https://github.com/Teamwork/node-auto-launch/issues/92
    this.autoLauncher.opts.appName = APP_NAME
  }

  async isEnabled() {
    try {
      const enabled = await this.autoLauncher.isEnabled()
      log.debug(`Autolaunch status: ${enabled.toString()}`)
      return enabled
    } catch (err) {
      log.error('could not check autolaunch status', { err })
      return false
    }
  }

  async enable() {
    try {
      await this.autoLauncher.enable()
      log.debug('Enabled autolaunch')
    } catch (err) {
      log.error('could not enable autolaunch', { err })
    }
  }

  async disable() {
    try {
      await this.autoLauncher.disable()
      log.debug('Disabled autolaunch')
    } catch (err) {
      log.error('could not disable autolaunch', { err })
    }
  }
}

class MacWinAutoLauncher {
  async isEnabled() {
    try {
      const { openAtLogin } = app.getLoginItemSettings({
        serviceName: APP_NAME
      })
      log.debug(`Autolaunch status: ${openAtLogin.toString()}`)
      return openAtLogin
    } catch (err) {
      log.error('could not check autolaunch status', { err })
      return false
    }
  }

  async enable() {
    try {
      app.setLoginItemSettings({ openAtLogin: true, serviceName: APP_NAME })
      log.debug('Enabled autolaunch')
    } catch (err) {
      log.error('could not enable autolaunch', { err })
    }
  }

  async disable() {
    try {
      app.setLoginItemSettings({ openAtLogin: false, serviceName: APP_NAME })
      log.debug('Disabled autolaunch')
    } catch (err) {
      log.error('could not disable autolaunch', { err })
    }
  }
}

if (process.env.APPIMAGE) {
  module.exports = new AppImageAutoLauncher()
} else {
  module.exports = new MacWinAutoLauncher()
}
