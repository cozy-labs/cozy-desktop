/* @flow */

import type { Metadata } from './metadata'
import type { Callback } from './utils'

// eslint-disable-next-line no-undef
export interface Side {
  addFile (doc: Metadata, callback: Callback): void;
  addFolder (doc: Metadata, callback: Callback): void|Promise<*>;
  overwriteFile (doc: Metadata, old: Metadata, callback: Callback): void|Promise<*>;
  updateFileMetadata (doc: Metadata, old: Metadata, callback: Callback): void;
  updateFolder (doc: Metadata, old: Metadata, callback: Callback): void;
  moveFile (doc: Metadata, from: Metadata, callback: Callback): void;
  moveFolder (doc: Metadata, from: Metadata, callback: Callback): void;
  trash (doc: Metadata, callback: Callback): void;
  destroy (doc: Metadata, callback: Callback): void;
}
