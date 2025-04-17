const fs = require('fs')
const path = require('path')
const util = require('util')

const renameAsync = util.promisify(fs.rename)
const unlinkAsync = util.promisify(fs.unlink)

module.exports = async function(context) {
  // Replace the app launcher on linux only.
  if (process.platform !== 'linux') {
    return
  }
  // eslint-disable-next-line no-console
  console.log('afterPack hook triggered', context)

  const executableName = context.packager.executableName
  const sourceExecutable = path.join(context.appOutDir, executableName)
  const targetExecutable = path.join(context.appOutDir, `${executableName}-bin`)
  const launcherScript = path.join(
    context.appOutDir,
    'resources',
    'launcher-script.sh'
  )
  const chromeSandbox = path.join(context.appOutDir, 'chrome-sandbox')

  return Promise.all([
    // rename twakedesktop to twakedesktop-bin
    renameAsync(sourceExecutable, targetExecutable),

    // rename launcher script to twakedesktop
    renameAsync(launcherScript, sourceExecutable),

    // remove the chrome-sandbox file since we explicitly disable it
    unlinkAsync(chromeSandbox)
  ])
}
