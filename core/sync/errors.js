/* @flow */

const { Promise } = require('bluebird')

const {
  HEARTBEAT: REMOTE_HEARTBEAT,
  TOS_UPDATED_WARNING_CODE
} = require('../remote/constants')
const remoteErrors = require('../remote/errors')
const logger = require('../utils/logger')

/*::
import type { SavedMetadata } from '../metadata'
import type { SideName } from '../side'
import type { Local } from '../local'
import type { Remote } from '../remote'
import type { Warning } from '../remote/cozy'
import type { RemoteError, FetchError } from '../remote/errors'
*/

const MISSING_PERMISSIONS_CODE = 'MissingPermissions'
const NO_DISK_SPACE_CODE = 'NoDiskSpace'
const UNKNOWN_SYNC_ERROR_CODE = 'UnknownSyncError'

const log = logger({
  component: 'Sync'
})

class SyncError extends Error {
  /*::
  $key: string
  $value: any

  code: string
  message: string
  originalErr: Error
  doc: SavedMetadata
  */

  constructor(
    { code, err, doc } /*: { code?: string, err: Error, doc: SavedMetadata } */
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

const checkFn = (
  err /*: RemoteError|SyncError */,
  { local, remote } /*: { local: Local, remote: Remote } */
) /*: [number, () => Promise<boolean>] */ => {
  if (err instanceof remoteErrors.RemoteError) {
    switch (err.code) {
      case remoteErrors.NEEDS_REMOTE_MERGE_CODE:
        return [
          REMOTE_HEARTBEAT,
          async () => {
            // We request a manual run as we don't want to completely stop the
            // synchronization in case the call fails but we discard any errors as
            // we can't really handle them here.
            const err = remote.watcher.resetTimeout({
              manualRun: true
            })
            return err == null
          }
        ]

      case remoteErrors.UNREACHABLE_COZY_CODE:
        return [
          10000,
          async () => {
            try {
              await remote.diskUsage()
              return true
            } catch (err) {
              log.debug({ err }, 'Could not fetch remote disk usage')
              return false
            }
          }
        ]

      case remoteErrors.USER_ACTION_REQUIRED_CODE:
        return [
          60000,
          async () => {
            try {
              await Promise.delay(180000) // Wait 3 minutes to give user the time to read the new ToS
              const warnings /*: Warning[] */ = await remote.remoteCozy.warnings()
              return (
                warnings.length === 0 ||
                warnings.find(
                  warning => warning.code === TOS_UPDATED_WARNING_CODE
                ) != null
              )
            } catch (err) {
              log.debug({ err }, 'Could not fetch remote warnings')
              return false
            }
          }
        ]

      default:
        // Keep retrying
        return [REMOTE_HEARTBEAT, async () => true]
    }
  } else if (err instanceof SyncError) {
    const { doc } = err
    switch (err.code) {
      case MISSING_PERMISSIONS_CODE:
        return [
          10000,
          async () => {
            try {
              return await local.canApplyChange(doc)
            } catch (err) {
              log.debug({ err }, 'Could not check local permissions')
              return false
            }
          }
        ]

      case NO_DISK_SPACE_CODE:
        return [
          60000, // TODO: change back to 60000
          async () => {
            try {
              const { size = 0 } = doc
              const { available } = await local.diskUsage()
              return available >= size
            } catch (err) {
              log.debug({ err }, 'Could not fetch local disk usage')
              return false
            }
          }
        ]

      case remoteErrors.NO_COZY_SPACE_CODE:
        return [
          60000,
          async () => {
            try {
              const { size = 0 } = doc
              const {
                attributes: { used, quota }
              } = await remote.diskUsage()
              if (!quota) return true
              else return quota - used >= size
            } catch (err) {
              log.debug({ err }, 'Could not fetch remote disk usage')
              return false
            }
          }
        ]

      case remoteErrors.NEEDS_REMOTE_MERGE_CODE:
        return [
          REMOTE_HEARTBEAT,
          async () => {
            // We request a manual run as we don't want to completely stop the
            // synchronization in case the call fails but we discard any errors as
            // we can't really handle them here.
            const errOrOffline = await remote.watcher.resetTimeout({
              manualRun: true
            })
            if (errOrOffline) {
              log.debug({ err: errOrOffline }, 'Could not fetch remote changes')
              return false
            }
            return true
          }
        ]

      case remoteErrors.UNREACHABLE_COZY_CODE:
        return [
          10000,
          async () => {
            try {
              await remote.diskUsage()
              return true
            } catch (err) {
              log.debug({ err }, 'Could not fetch remote disk usage')
              return false
            }
          }
        ]

      case remoteErrors.USER_ACTION_REQUIRED_CODE:
        return [
          60000,
          async () => {
            try {
              await Promise.delay(180000) // Wait 3 minutes to give user the time to read the new ToS
              const warnings /*: Warning[] */ = await remote.remoteCozy.warnings()
              return (
                warnings.length === 0 ||
                warnings.find(
                  warning => warning.code === TOS_UPDATED_WARNING_CODE
                ) != null
              )
            } catch (err) {
              log.debug({ err }, 'Could not fetch remote warnings')
              return false
            }
          }
        ]

      default:
        return [0, async () => false]
    }
  } else {
    return [0, async () => false]
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
  if (sideName === 'remote') {
    // The RemoteError code will be reused
    return new SyncError({ err: remoteErrors.wrapError(err), doc })
  } else if (err.code && ['EACCES', 'EPERM', 'EBUSY'].includes(err.code)) {
    return new SyncError({ err, code: MISSING_PERMISSIONS_CODE, doc })
  } else if (err.code && err.code === 'ENOSPC') {
    return new SyncError({ err, code: NO_DISK_SPACE_CODE, doc })
  } else {
    return new SyncError({ err, doc })
  }
}

module.exports = {
  MISSING_PERMISSIONS_CODE,
  NO_DISK_SPACE_CODE,
  UNKNOWN_SYNC_ERROR_CODE,
  SyncError,
  checkFn,
  wrapError
}
