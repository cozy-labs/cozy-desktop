/* @flow */

import * as stream from 'stream'

import type { Metadata } from './metadata'
import type { Callback } from './utils'

// Provides a stream.Readable for local or remote file corresponding to the
// given metadata.
export type FileStreamProvider = {
  createReadStream: (Metadata, Callback) => void;
  createReadStreamAsync: (Metadata) => Promise<stream.Readable>;
}
