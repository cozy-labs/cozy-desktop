/**
 *  Windows uses Uninstall registry subkeys to know where to find the
 *  uninstall executables of applications and list them in its programs
 *  management application.

 *  In the more recent versions of `electron-builder`, the format of the
 *  subkey has changed and `electron-builder` does not clean up old
 *  subkeys after an update.
 *  This means that users updating Cozy Desktop to v3.16.0 will see 2
 *  Cozy Desktop applications listed in the programs management
 *  application and trying to uninstall the oldest version will actually
 *  uninstall the most recent (the uninstall paths are the same) and leave
 *  the old entry without any way to remove it.

 *  We introduce here a registry cleanup during the app startup phase so
 *  that our users won't have to manually edit their registry to remove
 *  the old subkey.
 *
 * @flow
 */

const regedit = require('regedit')
regedit.setExternalVBSLocation('resources/regedit/vbs')

// Key used prior to v3.16.0
const OLD_UNINSTALL_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\4e3f3566-be06-5f9a-b012-0cf924cd77aa'

const REGEDIT_INEXISTANT_PATH_ERROR_CODE = 2
const REGEDIT_ERROR = 'RegeditError'
class RegeditError extends Error {
  /*::
  code: number
  */

  constructor(code /*: number */, msg /*: string */) {
    super(msg)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RegeditError)
    }

    this.name = REGEDIT_ERROR
    this.code = code
  }

  toString() {
    return `(${this.code}) ${this.name}: ${this.message}`
  }
}

async function removeOldUninstallKey() {
  return new Promise((resolve, reject) => {
    regedit.deleteKey(OLD_UNINSTALL_KEY, err => {
      if (err && err.code !== REGEDIT_INEXISTANT_PATH_ERROR_CODE) {
        reject(new RegeditError(err.code, err.message))
      }
      resolve()
    })
  })
}

module.exports = {
  RegeditError,
  removeOldUninstallKey
}
