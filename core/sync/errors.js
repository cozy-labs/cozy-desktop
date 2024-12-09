/* @flow */

const metadata = require('../metadata')
const { IncompatibleDocError } = require('../incompatibilities/platform')
const { HEARTBEAT: REMOTE_HEARTBEAT } = require('../remote/constants')
const remoteErrors = require('../remote/errors')
const { logger } = require('../utils/logger')
const { SECONDS, MINUTES } = require('../utils/time')

/*::
import type { SavedMetadata } from '../metadata'
import type { SideName } from '../side'
import type { Local } from '../local'
import type { Remote } from '../remote'
import type { Warning } from '../remote/cozy'
import type { RemoteError, FetchError } from '../remote/errors'
import type { Sync, Change } from '.'
*/

const log = logger({
  component: 'Sync:errors'
})

const EXCLUDED_DIR_CODE = 'ExcludedDir'
const INCOMPATIBLE_DOC_CODE = 'IncompatibleDoc'
const MISSING_PERMISSIONS_CODE = 'MissingPermissions'
const NO_DISK_SPACE_CODE = 'NoDiskSpace'
const UNSYNCED_PARENT_MOVE_CODE = 'UnsyncedParentMove'
const UNKNOWN_SYNC_ERROR_CODE = 'UnknownSyncError'

class UnsyncedParentMoveError extends Error {
  /*::
  parent: SavedMetadata
  */

  constructor(parent /*: SavedMetadata */) {
    super('Parent move was not successfully synchronized')

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnsyncedParentMoveError)
    }

    this.name = 'UnsyncedParentMoveError'
    this.parent = parent
  }
}

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
        return 10 * SECONDS

      case remoteErrors.USER_ACTION_REQUIRED_CODE:
        return 1 * MINUTES

      default:
        return REMOTE_HEARTBEAT
    }
  } else if (err instanceof SyncError) {
    // The error originates from Sync and means we failed to apply a change.
    switch (err.code) {
      case MISSING_PERMISSIONS_CODE:
        return 10 * SECONDS

      case NO_DISK_SPACE_CODE:
        return 1 * MINUTES

      case EXCLUDED_DIR_CODE:
        return 5 * MINUTES

      case UNSYNCED_PARENT_MOVE_CODE:
        return 0 // Don't wait since the problem is solved with the parent

      case remoteErrors.NO_COZY_SPACE_CODE:
        return 10 * SECONDS

      case remoteErrors.UNREACHABLE_COZY_CODE:
        return 10 * SECONDS

      case remoteErrors.USER_ACTION_REQUIRED_CODE:
        return 1 * MINUTES

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

const retry = async (
  cause /*: {| err: RemoteError |} | {| err: SyncError, change: Change |} */,
  sync /*: Sync */
) => {
  log.debug('retrying after blocking error', cause)

  const { err } = cause
  if (err.code === remoteErrors.UNREACHABLE_COZY_CODE) {
    // We could simply fetch the remote changes but it could take time
    // before we're done fetching them and we want to notify the GUI we're
    // back online as soon as possible.
    if (await sync.remote.ping()) {
      sync.events.emit('online')
    } else {
      sync.events.emit('offline')
      // $FlowFixMe intervals have a refresh() method starting with Node v10
      if (sync.retryInterval) sync.retryInterval.refresh()
      // We're still offline so no need to try fetching changes or
      // synchronizing.
      return
    }
  }

  clearInterval(sync.retryInterval)

  if (cause.change) {
    // We increment the record's errors counter to keep track of the
    // retries and above all, save any changes made to the record by
    // `applyDoc()` and such (e.g. when applying a file move with update,
    // if the update fails, we want to remove the `moveFrom` attribute to
    // avoid re-applying the move which was already applied).
    await sync.updateErrors(cause.change, cause.err)
  }

  // Await to make sure we've fetched potential remote changes
  if (sync.remote.watcher && !sync.remote.watcher.running) {
    await sync.remote.watcher.start()
  }
}

const skip = async (
  cause /*: {| err: RemoteError |} | {| err: SyncError, change: Change |} */,
  sync /*: Sync */
) => {
  log.debug('user skipped required action', cause)

  clearInterval(sync.retryInterval)

  if (cause.change) {
    await sync.skipChange(cause.change, cause.err)
  }

  if (!sync.remote.watcher.running) {
    await sync.remote.watcher.start()
  }
}

const createConflict = async (
  cause /*: {| err: RemoteError |} | {| err: SyncError, change: Change |} */,
  sync /*: Sync */
) => {
  log.debug('user requested conflict creation', cause)

  clearInterval(sync.retryInterval)

  if (cause.change) {
    const { change, err } = cause
    try {
      const conflict = await sync.local.resolveConflict(change.doc)

      // Skip the change since it would result in the same conflict error.
      await sync.skipChange(change, err)

      if (metadata.isFolder(change.doc)) {
        // Wait for our conflict to make it to PouchDB to avoid synchronizing its
        // descendants and creating more conflicts.
        await sync.waitForNewChangeOn(change.seq, conflict.path)
      }
    } catch (err) {
      log.debug('failed to create conflict on behalf of user', {
        path: change.doc.path,
        err,
        sentry: true
      })
    }
  }
}

const linkDirectories = async (
  cause /*: {| err: RemoteError |} | {| err: SyncError, change: Change |} */,
  sync /*: Sync */
) => {
  log.debug(
    'user requested directories linking (and re-inclusion in differential sync)',
    cause
  )

  clearInterval(sync.retryInterval)

  if (cause.change) {
    const { change, err } = cause
    try {
      await sync.remote.includeInSync(change.doc)

      // Skip the local change to avoid a conflict with the re-included
      // remote dir.
      await sync.skipChange(change, err)
    } catch (err) {
      log.debug('failed to re-include folder in sync on behalf of user', {
        path: change.doc.path,
        err,
        sentry: true
      })
    }
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
  } else if (err instanceof UnsyncedParentMoveError) {
    return new SyncError({
      sideName,
      err,
      code: UNSYNCED_PARENT_MOVE_CODE,
      doc
    })
  } else if (err instanceof IncompatibleDocError) {
    return new SyncError({ sideName, err, code: INCOMPATIBLE_DOC_CODE, doc })
  } else if (err instanceof remoteErrors.ExcludedDirError) {
    return new SyncError({ sideName, err, code: EXCLUDED_DIR_CODE, doc })
  } else if (remoteErrors.isNetworkError(err)) {
    // FetchErrors can be raised from the LocalWriter when failing to download a
    // file for example. In this case the error name won't be "FetchError" but
    // its message will still contain `net::`.
    // If err is a RemoteError, its code will be reused.
    return new SyncError({
      sideName,
      err: remoteErrors.wrapError(err, doc),
      doc
    })
  } else {
    return new SyncError({ sideName, err, doc })
  }
}

module.exports = {
  EXCLUDED_DIR_CODE,
  INCOMPATIBLE_DOC_CODE,
  MISSING_PERMISSIONS_CODE,
  NO_DISK_SPACE_CODE,
  UNKNOWN_SYNC_ERROR_CODE,
  UNSYNCED_PARENT_MOVE_CODE,
  UnsyncedParentMoveError,
  SyncError,
  retryDelay,
  retry,
  skip,
  createConflict,
  linkDirectories,
  wrapError
}
