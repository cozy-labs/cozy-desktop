/** Writes changes to the local FS or the remote Cozy.
 *
 * See the `Writer` interface.
 *
 * @module core/writer
 * @flow
 */

/*::
import type { Metadata, SavedMetadata } from './metadata'
import type { SideName } from './side'
import type { ProgressCallback } from './utils/stream'

export interface Writer {
  name: SideName;
  addFileAsync (doc: SavedMetadata, onProgress: ?ProgressCallback): Promise<void>;
  addFolderAsync (doc: SavedMetadata): Promise<void>;
  overwriteFileAsync (doc: SavedMetadata, onProgress: ?ProgressCallback): Promise<void>;
  updateFileMetadataAsync (doc: SavedMetadata): Promise<void>;
  updateFolderAsync (doc: SavedMetadata): Promise<void>;
  moveAsync<T: Metadata|SavedMetadata> (doc: T, from: T): Promise<void>;
  assignNewRemote (doc: SavedMetadata): Promise<void>;
  trashAsync (doc: SavedMetadata): Promise<void>;
  resolveConflict<T: Metadata|SavedMetadata> (doc: T): Promise<*>;
}
*/
