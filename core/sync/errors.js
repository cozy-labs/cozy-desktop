/* @flow */

const { IncompatibleDocError } = require('../incompatibilities/platform')
const { HEARTBEAT: REMOTE_HEARTBEAT } = require('../remote/constants')
const remoteErrors = require('../remote/errors')

/*::
import type { SavedMetadata } from '../metadata'
import type { SideName } from '../side'
import type { Local } from '../local'
import type { Remote } from '../remote'
import type { Warning } from '../remote/cozy'
import type { RemoteError, FetchError } from '../remote/errors'
*/

const INCOMPATIBLE_DOC_CODE = 'IncompatibleDoc'
const MISSING_PERMISSIONS_CODE = 'MissingPermissions'
const NO_DISK_SPACE_CODE = 'NoDiskSpace'
const UNKNOWN_SYNC_ERROR_CODE = 'UnknownSyncError'

class SyncError extends Error {
  /*::
  $key: string
  $value: any

  code: string
  message: string
  sideName: SideName
  originalErr: Error
  doc: SavedMetadata
  */

  constructor(
    {
      code,
      sideName,
      err,
      doc
    } /*: { code?: string, sideName: SideName, err: Error, doc: SavedMetadata } */
  ) {
    super(err.message)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SyncError)
    }

    // Copy over all attributes from original error. We copy them before setting
    // other attributes to make sure the specific SyncError attributes are not
    // overwritten.
    for (const [attr, value] of Object.entries(err)) {
      this[attr] = value
    }

    this.name = 'SyncError'
    this.code = code || this.code || UNKNOWN_SYNC_ERROR_CODE
    this.sideName = sideName
    this.doc = doc
    this.originalErr = err

    this.buildMessage()
  }

  // Sets error message to:
  //   | <Code>: <Original error message>
  //   | <Code>: <Affected doc path>: <Original error message>
  buildMessage() {
    this.message =
      `[${this.code}]: ` + (this.doc ? `${this.doc.path}: ` : '') + this.message
  }
}

const retryDelay = (err /*: RemoteError|SyncError */) /*: number */ => {
  // Speed up tests
  if (process.env.NODE_ENV === 'test') return 500

  if (err instanceof remoteErrors.RemoteError) {
    // The error originates from the Remote Watcher and is not a change
    // application error.
    switch (err.code) {
      case remoteErrors.UNREACHABLE_COZY_CODE:
        return 10000

      case remoteErrors.USER_ACTION_REQUIRED_CODE:
        return 60000

      default:
        return REMOTE_HEARTBEAT
    }
  } else if (err instanceof SyncError) {
    // The error originates from Sync and means we failed to apply a change.
    switch (err.code) {
      case MISSING_PERMISSIONS_CODE:
        return 10000

      case NO_DISK_SPACE_CODE:
        return 60000

      case remoteErrors.NO_COZY_SPACE_CODE:
        return 10000

      case remoteErrors.UNREACHABLE_COZY_CODE:
        return 10000

      case remoteErrors.USER_ACTION_REQUIRED_CODE:
        return 60000

      default:
        // Arbutrary value to make sure we don't retry too soon and overload the
        // server with requests.
        // This also gives us the opportunity to merge new remote changes and
        // fix errors.
        return REMOTE_HEARTBEAT
    }
  } else {
    // Arbutrary value to make sure we don't retry too soon and overload the
    // server with requests.
    return REMOTE_HEARTBEAT
  }
}

/* This method wraps errors caught during a Sync.apply call.
 * Those errors were most probably raised from the Local or Remote side thus
 * making a SyncError type unnecessary.
 * However, we're not wrapping Local and Remote methods calls' errors yet. When
 * this is done, we can revisit this wrapping and rely solely on other error
 * types.
 */
const wrapError = (
  err /*: ErrnoError|FetchError|Error */,
  sideName /*: SideName */,
  { doc } /*: { doc: SavedMetadata } */ = {}
) => {
  if (err.code && ['EACCES', 'EPERM', 'EBUSY'].includes(err.code)) {
    return new SyncError({ sideName, err, code: MISSING_PERMISSIONS_CODE, doc })
  } else if (err.code && err.code === 'ENOSPC') {
    return new SyncError({ sideName, err, code: NO_DISK_SPACE_CODE, doc })
  } else if (err instanceof IncompatibleDocError) {
    return new SyncError({ sideName, err, code: INCOMPATIBLE_DOC_CODE, doc })
  } else if (sideName === 'remote' || err.name === 'FetchError') {
    // FetchErrors can be raised from the LocalWriter when failing to download a
    // file for example. In this case the sideName will be "local" but the error
    // name will still be "FetchError".
    // If err is a RemoteError, its code will be reused.
    return new SyncError({ sideName, err: remoteErrors.wrapError(err), doc })
  } else {
    return new SyncError({ sideName, err, doc })
  }
}

module.exports = {
  INCOMPATIBLE_DOC_CODE,
  MISSING_PERMISSIONS_CODE,
  NO_DISK_SPACE_CODE,
  UNKNOWN_SYNC_ERROR_CODE,
  SyncError,
  retryDelay,
  wrapError
}
