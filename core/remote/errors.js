/**
 * @module core/remote/errors
 * @flow
 */

const { FILE_TYPE, MAX_FILE_SIZE } = require('./constants')

/*::
import type { SavedMetadata } from '../metadata'
import type { Warning } from './cozy'

import type { FetchError } from 'cozy-stack-client'
export type { FetchError }
*/

const CONFLICTING_NAME_CODE = 'ConflictingName'
const OAUTH_CLIENT_REVOKED_CODE = 'OAuthClientRevoked'
const TWAKE_NOT_FOUND_CODE = 'TwakeNotFound'
const DOCUMENT_IN_TRASH_CODE = 'DocumentInTrash'
const FILE_TOO_LARGE_CODE = 'FileTooLarge'
const INVALID_FOLDER_MOVE_CODE = 'InvalidFolderMove'
const INVALID_METADATA_CODE = 'InvalidMetadata'
const INVALID_NAME_CODE = 'InvalidName'
const MISSING_DOCUMENT_CODE = 'MissingDocument'
const MISSING_PARENT_CODE = 'MissingParent'
const MISSING_PERMISSIONS_CODE = 'MissingPermissions'
const NEEDS_REMOTE_MERGE_CODE = 'NeedsRemoteMerge'
const NO_COZY_SPACE_CODE = 'NoCozySpace'
const PATH_TOO_DEEP_CODE = 'PathTooDeep'
const REMOTE_MAINTENANCE_ERROR_CODE = 'RemoteMaintenance'
const UNKNOWN_INVALID_DATA_ERROR_CODE = 'UnknownInvalidDataError'
const UNKNOWN_REMOTE_ERROR_CODE = 'UnknownRemoteError'
const UNREACHABLE_COZY_CODE = 'UnreachableCozy'
const USER_ACTION_REQUIRED_CODE = 'UserActionRequired'

const OAUTH_CLIENT_REVOKED_MESSAGE =
  'Your Twake Desktop authorizations have been revoked' // Only necessary for the GUI

class DirectoryNotFound extends Error {
  /*::
  path: string
  cozyURL: string
  */

  constructor(path /*: string */, cozyURL /*: string */) {
    super(`Directory ${path} was not found on Twake Workplace ${cozyURL}`)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DirectoryNotFound)
    }

    this.name = 'DirectoryNotFound'
    this.path = path
    this.cozyURL = cozyURL
  }
}

class ExcludedDirError extends Error {
  /*::
  path: string
  */

  constructor(path /*: string */) {
    super(
      `Directory ${path} was excluded from the synchronization on this client`
    )

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DirectoryNotFound)
    }

    this.name = 'ExcludedDirError'
    this.path = path
  }
}

class RemoteError extends Error {
  /*::
  $key: string
  $value: any

  code: string
  originalErr: Error
  */

  static fromWarning(warning /*: Warning */) {
    return new RemoteError({
      code: USER_ACTION_REQUIRED_CODE,
      message: warning.title,
      extra: warning,
      err: new Error(warning)
    })
  }

  constructor(
    {
      code = UNKNOWN_REMOTE_ERROR_CODE,
      message,
      err,
      extra = {}
    } /*: { code?: string, message?: string, err: Error, extra?: Object } */
  ) {
    super(message)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RemoteError)
    }

    // Copy over all attributes from original error. We copy them before setting
    // other attributes to make sure the specific RemoteError attributes are not
    // overwritten.
    for (const [attr, value] of Object.entries(err)) {
      Object.defineProperty(this, attr, {
        value,
        writable: true,
        enumerable: true
      })
    }

    // Copy over extra attributes. We copy them before setting other attributes
    // to make sure the specific RemoteError attributes are not overwritten.
    for (const [attr, value] of Object.entries(extra)) {
      Object.defineProperty(this, attr, {
        value,
        writable: true,
        enumerable: true
      })
    }

    this.name = 'RemoteError'
    this.code = code
    this.originalErr = err

    this.buildMessage()
  }

  // Sets error message to:
  //   | <Original error message>
  //   | <Code>: <Original error message>
  //   | <Custom message>: <Original error message>
  //   | <Code>: <Custom message>: <Original error message>
  buildMessage() {
    this.message =
      (this.code ? `[${this.code}]: ` : '') +
      (this.message && this.message !== '' ? `${this.message}: ` : '') +
      this.originalErr.message
  }
}

const wrapError = (
  err /*: FetchError |  Error */,
  doc /*: ?SavedMetadata */
) /*: RemoteError */ => {
  if (isNetworkError(err)) {
    // $FlowFixMe FetchErrors missing status will fallback to the default case
    const { status } = err

    switch (status) {
      case 400:
        if (detail(err) === 'File or directory is already in the trash') {
          return new RemoteError({
            code: DOCUMENT_IN_TRASH_CODE,
            message: 'Remote document is in the Twake Workplace trash',
            err
          })
        } else {
          // TODO: Merge with ClientRevokedError
          return new RemoteError({
            code: OAUTH_CLIENT_REVOKED_CODE,
            message: OAUTH_CLIENT_REVOKED_MESSAGE, // We'll match the message to display an error in gui/main
            err
          })
        }
      case 402:
        try {
          const parsedMessage = JSON.parse(err.message)
          return new RemoteError({
            code: USER_ACTION_REQUIRED_CODE,
            message: parsedMessage.title,
            err,
            extra: parsedMessage[0] // cozy-stack returns error arrays
          })
        } catch (parseError) {
          return new RemoteError({ err })
        }
      case 403:
        return new RemoteError({
          code: MISSING_PERMISSIONS_CODE,
          message: 'OAuth client is missing permissions (lack disk-usage?)',
          err
        })
      case 404:
        if (hasNoReason(err)) {
          return new RemoteError({
            code: TWAKE_NOT_FOUND_CODE,
            message: 'Twake Workplace not be found',
            err
          })
        } else {
          return new RemoteError({
            code: MISSING_DOCUMENT_CODE,
            message: 'The updated document is missing on the Twake Workplace',
            err
          })
        }
      case 409:
        return new RemoteError({
          code: CONFLICTING_NAME_CODE,
          message:
            'A document with the same name already exists on the Twake Workplace at the same location',
          err
        })
      case 412:
        if (sourceParameter(err) === 'If-Match') {
          // Revision error
          return new RemoteError({
            code: NEEDS_REMOTE_MERGE_CODE,
            message: 'The known remote document revision is outdated',
            err
          })
        } else if (sourceParameter(err) === 'dir-id') {
          // The directory is asked to move to one of its sub-directories
          return new RemoteError({
            code: INVALID_FOLDER_MOVE_CODE,
            message:
              'The folder would be moved wihtin one of its sub-folders on the Twake Workplace',
            err
          })
        } else {
          // Invalid hash or content length error
          return new RemoteError({
            code: INVALID_METADATA_CODE,
            message: 'The local metadata for the document is corrupted',
            err
          })
        }
      case 413:
        if (isFileLargerThanAllowed(doc)) {
          return new RemoteError({
            code: FILE_TOO_LARGE_CODE,
            message: 'The file is larger than allowed by the Twake Workplace',
            err
          })
        } else {
          return new RemoteError({
            code: NO_COZY_SPACE_CODE,
            message: 'Not enough space available on Twake Workplace',
            err
          })
        }
      case 422:
        if (sourceParameter(err) === 'name') {
          return new RemoteError({
            code: INVALID_NAME_CODE,
            message:
              'The name of the document contains characters forbidden by the Twake Workplace',
            err
          })
        } else if (sourceParameter(err) === 'path') {
          return new RemoteError({
            code: PATH_TOO_DEEP_CODE,
            message:
              'The path of the document has too many levels for the Twake Workplace',
            err
          })
        } else {
          return new RemoteError({
            code: INVALID_METADATA_CODE,
            message: 'The local metadata for the document is corrupted',
            err
          })
        }
      default:
        if (status > 400 && status < 500) {
          return new RemoteError({
            code: UNKNOWN_INVALID_DATA_ERROR_CODE,
            message:
              'The data sent to the Twake Workplace is invalid for some unhandled reason',
            err
          })
        } else if (status >= 500 && status < 600) {
          return new RemoteError({
            code: UNKNOWN_REMOTE_ERROR_CODE,
            message:
              'The Twake Workplace failed to process the request for an unknown reason',
            err
          })
        } else {
          // TODO: Merge with UnreachableError?!
          return new RemoteError({
            code: UNREACHABLE_COZY_CODE,
            message: 'Cannot reach Twake Workplace',
            err
          })
        }
    }
  } else if (err instanceof DirectoryNotFound) {
    return new RemoteError({
      code: MISSING_PARENT_CODE,
      message:
        'The parent directory of the document is missing on the Twake Workplace',
      err
    })
  } else if (err instanceof RemoteError) {
    return err
  } else {
    return new RemoteError({ err })
  }
}

function sourceParameter(err /*: FetchError */) /*: ?string */ {
  const { errors } = err.reason || {}
  const { source } = (errors && errors[0]) || {}
  const { parameter } = source || {}
  return parameter
}

function hasNoReason(err /*: FetchError */) /*: boolean %checks */ {
  return (
    err.reason != null &&
    typeof err.reason === 'object' &&
    err.reason.error != null &&
    typeof err.reason.error === 'object' &&
    Object.keys(err.reason.error).length === 0
  )
}

function isFileLargerThanAllowed(
  doc /*: ?SavedMetadata */
) /*: boolean %checks */ {
  return (
    doc != null &&
    doc.docType === FILE_TYPE &&
    doc.size != null &&
    doc.size > MAX_FILE_SIZE
  )
}

function detail(err /*: FetchError */) /*: ?string */ {
  const { errors } = err.reason || {}
  const { detail } = (errors && errors[0]) || {}
  return detail
}

function isNetworkError(err /*: Error */) {
  return (
    err.name === 'FetchError' ||
    (typeof err.message === 'string' && err.message.includes('net::'))
  )
}

function isRetryableNetworkError(err /*: Error */) {
  return (
    typeof err.message === 'string' &&
    err.message.includes('net::') &&
    !err.message.includes('net::ERR_INTERNET_DISCONNECTED') &&
    !err.message.includes('net::ERR_PROXY_CONNECTION_FAILED')
  )
}

module.exports = {
  DirectoryNotFound,
  ExcludedDirError,
  RemoteError,
  OAUTH_CLIENT_REVOKED_MESSAGE, // FIXME: should be removed once gui/main does not use it anymore
  CONFLICTING_NAME_CODE,
  OAUTH_CLIENT_REVOKED_CODE,
  TWAKE_NOT_FOUND_CODE,
  DOCUMENT_IN_TRASH_CODE,
  FILE_TOO_LARGE_CODE,
  INVALID_FOLDER_MOVE_CODE,
  INVALID_METADATA_CODE,
  INVALID_NAME_CODE,
  MISSING_DOCUMENT_CODE,
  MISSING_PARENT_CODE,
  MISSING_PERMISSIONS_CODE,
  NEEDS_REMOTE_MERGE_CODE,
  NO_COZY_SPACE_CODE,
  PATH_TOO_DEEP_CODE,
  REMOTE_MAINTENANCE_ERROR_CODE,
  UNKNOWN_INVALID_DATA_ERROR_CODE,
  UNKNOWN_REMOTE_ERROR_CODE,
  UNREACHABLE_COZY_CODE,
  USER_ACTION_REQUIRED_CODE,
  isNetworkError,
  isRetryableNetworkError,
  wrapError
}
