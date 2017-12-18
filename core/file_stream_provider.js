/* @flow */

import * as stream from 'stream'

import type { Metadata } from './metadata'

// Provides a stream.Readable for local or remote file corresponding to the
// given metadata.
export type FileStreamProvider = {
  createReadStreamAsync: (Metadata) => Promise<stream.Readable>;
}
