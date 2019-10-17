// See: https://medium.com/@TwitterArchiveEraser/notarize-electron-apps-7a5f988406db

const fs = require('fs')
const path = require('path')
// eslint-disable-next-line node/no-unpublished-require
const electron_notarize = require('electron-notarize')

module.exports = async function(params) {
  // Only notarize the app on Mac OS only.
  if (process.platform !== 'darwin') {
    return
  }
  // eslint-disable-next-line no-console
  console.log('afterSign hook triggered', params)

  // Same appId in electron-builder.
  const appId = 'io.cozy.desktop'

  const appPath = path.join(
    params.appOutDir,
    `${params.packager.appInfo.productFilename}.app`
  )
  if (!fs.existsSync(appPath)) {
    throw new Error(`Cannot find application at: ${appPath}`)
  }

  // eslint-disable-next-line no-console
  console.log(`Notarizing ${appId} found at ${appPath}`)

  try {
    await electron_notarize.notarize({
      appBundleId: appId,
      appPath: appPath,
      appleId: process.env.appleId,
      appleIdPassword: process.env.appleIdPassword
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error)
  }

  // eslint-disable-next-line no-console
  console.log(`Done notarizing ${appId}`)
}
