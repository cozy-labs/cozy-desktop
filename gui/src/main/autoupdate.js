const autoUpdater = require('electron-updater').autoUpdater
const os = require('os')

const log = require('cozy-desktop').default.logger({
  component: 'GUI'
})

module.exports.checkForNewRelease = () => {
  const platform = os.platform()
  if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
    return
  }

  autoUpdater.addListener('error', (err) => log.error(err))
  autoUpdater.checkForUpdates()
  setInterval(() => {
    autoUpdater.checkForUpdates()
  }, 1000 * 60 * 60 * 24) // Check if a new release is available once per day

  return autoUpdater
}

module.exports.quitAndInstall = () => autoUpdater.quitAndInstall()
