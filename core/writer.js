/** Writes changes to the local FS or the remote Cozy.
 *
 * See the `Writer` interface.
 *
 * @module core/writer
 * @flow
 */

/*::
import type { DirMetadata, FileMetadata, Metadata, Saved, SavedMetadata } from './metadata'
import type { SideName } from './side'
import type { ProgressCallback } from './utils/stream'

export interface Writer {
  name: SideName;
  addFileAsync (doc: Saved<FileMetadata>, onProgress: ?ProgressCallback): Promise<void>;
  addFolderAsync (doc: Saved<DirMetadata>): Promise<void>;
  overwriteFileAsync (doc: Saved<FileMetadata>, onProgress: ?ProgressCallback): Promise<void>;
  updateFileMetadataAsync (doc: Saved<FileMetadata>): Promise<void>;
  updateFolderAsync (doc: Saved<DirMetadata>): Promise<void>;
  moveAsync<T: Metadata|SavedMetadata> (doc: T, from: T): Promise<void>;
  assignNewRemote (doc: SavedMetadata): Promise<void>;
  trashAsync (doc: SavedMetadata): Promise<void>;
  resolveConflict (doc: SavedMetadata): Promise<*>;
}
*/
