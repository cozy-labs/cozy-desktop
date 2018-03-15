/* @flow */

import type { Metadata } from './metadata'

const stream = require('stream')

class ReadableWithContentLength extends stream.Readable {contentLength: ?number}

function withContentLength (s: stream.Readable, contentLength: ?number): ReadableWithContentLength {
  const s2: ReadableWithContentLength = (s: any)
  s2.contentLength = contentLength
  return s2
}

// Provides a stream.Readable for local or remote file corresponding to the
// given metadata.
export type FileStreamProvider = {
  createReadStreamAsync: (Metadata) => Promise<ReadableWithContentLength>;
}

module.exports = {
  ReadableWithContentLength,
  withContentLength
}
