/* @flow */

import type { Metadata } from './metadata'
import type { Callback } from './utils'

// Provides a stream.Readable for local or remote file corresponding to the
// given metadata.
export type FileStreamProvider = {
  createReadStream: (Metadata, Callback) => void
}
