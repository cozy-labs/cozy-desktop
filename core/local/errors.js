/**
 * @module core/local/errors
 * @flow
 */

const SYNC_DIR_EMPTY_MESSAGE = 'Syncdir is empty'
const SYNC_DIR_UNLINKED_MESSAGE = 'Syncdir has been unlinked'

// Error raised by local file system operations, e.g. reading a file to upload.
// Local FS errors can carry socket-like codes (e.g. ECONNRESET from a failing
// disk) but they are not network errors: hasNetworkInterruption() in
// core/remote/errors relies on this class to never treat them as such.
class LocalFsError extends Error {
  /*::
  code: ?string
  cause: Error
  */

  constructor(err /*: Error */) {
    super(err.message)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LocalFsError)
    }

    this.name = 'LocalFsError'
    this.code = (err /*: { code?: string } */).code
    this.cause = err
  }
}

module.exports = {
  SYNC_DIR_EMPTY_MESSAGE,
  SYNC_DIR_UNLINKED_MESSAGE,
  LocalFsError
}
