/** Writes changes to the local FS or the remote Cozy.
 *
 * See the `Writer` interface.
 *
 * @module core/writer
 * @flow
 */

/*::
import type { SavedMetadata } from './metadata'
import type { SideName } from './side'

export interface Writer {
  addFileAsync (doc: SavedMetadata): Promise<void>;
  addFolderAsync (doc: SavedMetadata): Promise<void>;
  overwriteFileAsync (doc: SavedMetadata, old: ?SavedMetadata): Promise<void>;
  updateFileMetadataAsync (doc: SavedMetadata): Promise<void>;
  updateFolderAsync (doc: SavedMetadata): Promise<void>;
  moveAsync (doc: SavedMetadata, from: SavedMetadata): Promise<void>;
  assignNewRemote (doc: SavedMetadata): Promise<void>;
  trashAsync (doc: SavedMetadata): Promise<void>;
  deleteFolderAsync (doc: SavedMetadata): Promise<void>;
}
*/
