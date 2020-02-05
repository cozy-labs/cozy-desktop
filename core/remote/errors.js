/**
 * @module core/remote/errors
 * @flow
 */

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

module.exports = {
  CozyDocumentMissingError,
  UnreachableError
}
