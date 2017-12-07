const AutoLaunch = require('auto-launch')
const autoLauncher = new AutoLaunch({
  name: 'Cozy-Desktop',
  isHidden: true
})

module.exports.isEnabled = () => autoLauncher.isEnabled()

module.exports.setEnabled = (enabled) => {
  autoLauncher.isEnabled().then((was) => {
    if (was !== enabled) {
      if (enabled) {
        autoLauncher.enable()
      } else {
        autoLauncher.disable()
      }
    }
  })
}
