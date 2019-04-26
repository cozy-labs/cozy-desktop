const AutoLaunch = require('auto-launch')

const opts = {
  name: 'Cozy-Desktop',
  isHidden: true
}

if (process.env.APPIMAGE) {
  opts.path = process.env.APPIMAGE
}

const autoLauncher = new AutoLaunch(opts)

module.exports.isEnabled = () => autoLauncher.isEnabled()

module.exports.setEnabled = enabled => {
  autoLauncher.isEnabled().then(was => {
    if (was !== enabled) {
      if (enabled) {
        autoLauncher.enable()
      } else {
        autoLauncher.disable()
      }
    }
  })
}
