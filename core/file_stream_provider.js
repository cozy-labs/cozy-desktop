/* @flow */

import * as stream from 'stream'

import type { Metadata } from './metadata'

export class ReadableWithContentLength extends stream.Readable {contentLength: ?number}

export function withContentLength (s: stream.Readable, contentLength: ?number): ReadableWithContentLength {
  const s2: ReadableWithContentLength = (s: any)
  s2.contentLength = contentLength
  return s2
}

// Provides a stream.Readable for local or remote file corresponding to the
// given metadata.
export type FileStreamProvider = {
  createReadStreamAsync: (Metadata) => Promise<ReadableWithContentLength>;
}
