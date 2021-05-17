/**
 * @module core/remote/errors
 * @flow
 */

/*::
import type { RemoteChange } from './change'
import type { MetadataChange } from '../sync'
import type { Warning } from './cozy'

import type { FetchError } from 'cozy-stack-client'
export type { FetchError }
*/

const CONFLICTING_NAME_CODE = 'ConflictingName'
const COZY_CLIENT_REVOKED_CODE = 'CozyClientRevoked'
const INVALID_FOLDER_MOVE_CODE = 'InvalidFolderMove'
const INVALID_METADATA_CODE = 'InvalidMetadata'
const INVALID_NAME_CODE = 'InvalidName'
const MISSING_DOCUMENT_CODE = 'MissingDocument'
const MISSING_PARENT_CODE = 'MissingParent'
const MISSING_PERMISSIONS_CODE = 'MissingPermissions'
const NEEDS_REMOTE_MERGE_CODE = 'NeedsRemoteMerge'
const NO_COZY_SPACE_CODE = 'NoCozySpace'
const PATH_TOO_DEEP_CODE = 'PathTooDeep'
const UNKNOWN_INVALID_DATA_ERROR_CODE = 'UnknownInvalidDataError'
const UNKNOWN_REMOTE_ERROR_CODE = 'UnknownRemoteError'
const UNREACHABLE_COZY_CODE = 'UnreachableCozy'
const USER_ACTION_REQUIRED_CODE = 'UserActionRequired'

const COZY_CLIENT_REVOKED_MESSAGE = 'Cozy client has been revoked' // Only necessary for the GUI

class CozyDocumentMissingError extends Error {
  /*::
  cozyURL: string
  doc: { name: string }
  */

  constructor(
    { cozyURL, doc } /*: { cozyURL: string, doc: { name: string } } */
  ) {
    super('Could not find document on remote Cozy')

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CozyDocumentMissingError)
    }

    this.name = 'CozyDocumentMissingError'
    this.cozyURL = cozyURL
    this.doc = doc
  }
}

class DirectoryNotFound extends Error {
  /*::
  path: string
  cozyURL: string
  */

  constructor(path /*: string */, cozyURL /*: string */) {
    super(`Directory ${path} was not found on Cozy ${cozyURL}`)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DirectoryNotFound)
    }

    this.name = 'DirectoryNotFound'
    this.path = path
    this.cozyURL = cozyURL
  }
}

class UnreachableError extends Error {
  /*::
  cozyURL: string
  */

  constructor({ cozyURL } /*: { cozyURL: string } */) {
    super('Cannot reach remote Cozy')

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnreachableError)
    }

    this.name = 'UnreachableError'
    this.cozyURL = cozyURL
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
      Error.captureStackTrace(this, CozyDocumentMissingError)
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

const wrapError = (err /*: FetchError |  Error */) /*: RemoteError */ => {
  if (err.name === 'FetchError') {
    // $FlowFixMe FetchErrors missing status will fallback to the default case
    const { status } = err

    switch (status) {
      case 400:
        // TODO: Merge with ClientRevokedError
        return new RemoteError({
          code: COZY_CLIENT_REVOKED_CODE,
          message: COZY_CLIENT_REVOKED_MESSAGE, // We'll match the message to display an error in gui/main
          err
        })
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
          message: 'Cozy client is missing permissions (lack disk-usage?)',
          err
        })
      case 404:
        return new RemoteError({
          code: MISSING_DOCUMENT_CODE,
          message: 'The updated document is missing on the remote Cozy',
          err
        })
      case 409:
        return new RemoteError({
          code: CONFLICTING_NAME_CODE,
          message:
            'A document with the same name already exists on the remote Cozy at the same location',
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
              'The folder would be moved wihtin one of its sub-folders on the remote Cozy',
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
        return new RemoteError({
          code: NO_COZY_SPACE_CODE,
          message: 'Not enough space available on remote Cozy',
          err
        })
      case 422:
        if (sourceParameter(err) === 'name') {
          return new RemoteError({
            code: INVALID_NAME_CODE,
            message:
              'The name of the document contains characters forbidden by the remote Cozy',
            err
          })
        } else if (sourceParameter(err) === 'path') {
          return new RemoteError({
            code: PATH_TOO_DEEP_CODE,
            message:
              'The path of the document has too many levels for the remote Cozy',
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
              'The data sent to the remote Cozy is invalid for some unhandled reason',
            err
          })
        } else {
          // TODO: Merge with UnreachableError?!
          return new RemoteError({
            code: UNREACHABLE_COZY_CODE,
            message: 'Cannot reach remote Cozy',
            err
          })
        }
    }
  } else if (err instanceof DirectoryNotFound) {
    return new RemoteError({
      code: MISSING_PARENT_CODE,
      message:
        'The parent directory of the document is missing on the remote Cozy',
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

module.exports = {
  CozyDocumentMissingError,
  DirectoryNotFound,
  RemoteError,
  UnreachableError,
  COZY_CLIENT_REVOKED_MESSAGE, // FIXME: should be removed once gui/main does not use it anymore
  CONFLICTING_NAME_CODE,
  COZY_CLIENT_REVOKED_CODE,
  INVALID_FOLDER_MOVE_CODE,
  INVALID_METADATA_CODE,
  INVALID_NAME_CODE,
  MISSING_DOCUMENT_CODE,
  MISSING_PARENT_CODE,
  MISSING_PERMISSIONS_CODE,
  NEEDS_REMOTE_MERGE_CODE,
  NO_COZY_SPACE_CODE,
  PATH_TOO_DEEP_CODE,
  UNKNOWN_INVALID_DATA_ERROR_CODE,
  UNKNOWN_REMOTE_ERROR_CODE,
  UNREACHABLE_COZY_CODE,
  USER_ACTION_REQUIRED_CODE,
  wrapError
}
