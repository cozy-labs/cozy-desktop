/** Auto-launching the app on session start.
 *
 * @module gui/js/autolaunch
 */

const AutoLaunch = require('auto-launch')

const log = require('../../core/app').logger({
  component: 'GUI'
})

const APP_NAME = 'Cozy-Desktop'
const opts = {
  name: APP_NAME,
  isHidden: true
}

if (process.env.APPIMAGE) {
  opts.path = process.env.APPIMAGE
}

const autoLauncher = new AutoLaunch(opts)

if (process.env.APPIMAGE) {
  // Fix issue with `auto-launch` that uses the path instead of the app name
  // when defining the autolaunch entry leading to autolaunch to stop working
  // after an app update.
  // See https://github.com/Teamwork/node-auto-launch/issues/92

  // Make sure the autolaunch entry will use the app's name.
  autoLauncher.opts.appName = APP_NAME

  // Check if there is an autolaunch entry with the app's path.
  autoLauncher
    .isEnabled()
    .then(pathAutoLaunchEnabled => {
      if (pathAutoLaunchEnabled) {
        // Remove it to avoid having multiple entries.
        autoLauncher.disable()

        // Create an autolaunch entry with the app's name if there was an entry
        // with the app's path.
        autoLauncher.enable()
      }
      return
    })
    .catch(err =>
      log.error('could not check autolaunch or replace old one', { err })
    )
}

module.exports.isEnabled = () => autoLauncher.isEnabled()

module.exports.setEnabled = enabled => {
  autoLauncher
    .isEnabled()
    .then(was => {
      if (was !== enabled) {
        if (enabled) {
          autoLauncher.enable()
          return true
        } else {
          autoLauncher.disable()
          return false
        }
      }
      return was
    })
    .catch(err => log.error('could not set autolaunch', { err }))
}
