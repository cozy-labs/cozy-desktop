/* @flow */

import type { Metadata } from './metadata'
import type { Callback } from './utils/func'

export type SideName =
  | "local"
  | "remote";

// eslint-disable-next-line no-undef
export interface Side {
  addFile (doc: Metadata, callback: Callback): void;
  addFileAsync (doc: Metadata): Promise<*>;
  addFolder (doc: Metadata, callback: Callback): void|Promise<*>;
  addFolderAsync (doc: Metadata): Promise<*>;
  overwriteFile (doc: Metadata, old: Metadata, callback: Callback): void|Promise<*>;
  overwriteFileAsync (doc: Metadata, old: Metadata): Promise<*>;
  updateFileMetadata (doc: Metadata, old: Metadata, callback: Callback): void;
  updateFileMetadataAsync (doc: Metadata, old: Metadata): Promise<*>;
  updateFolder (doc: Metadata, old: Metadata, callback: Callback): void;
  updateFolderAsync (doc: Metadata, old: Metadata): Promise<*>;
  moveFile (doc: Metadata, from: Metadata, callback: Callback): void;
  moveFileAsync (doc: Metadata, from: Metadata): Promise<*>;
  moveFolder (doc: Metadata, from: Metadata, callback: Callback): void;
  moveFolderAsync (doc: Metadata, from: Metadata): Promise<*>;
  trash (doc: Metadata, callback: Callback): void;
  trashAsync (doc: Metadata): Promise<*>;
  destroy (doc: Metadata, callback: Callback): void;
  destroyAsync (doc: Metadata): Promise<*>;
}
