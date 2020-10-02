/** Writes changes to the local FS or the remote Cozy.
 *
 * See the `Writer` interface.
 *
 * @module core/writer
 * @flow
 */

/*::
import type { Metadata } from './metadata'
import type { SideName } from './side'

export interface Writer {
  addFileAsync (doc: Metadata): Promise<void>;
  addFolderAsync (doc: Metadata): Promise<void>;
  overwriteFileAsync (doc: Metadata, old: ?Metadata): Promise<void>;
  updateFileMetadataAsync (doc: Metadata, old: Metadata): Promise<void>;
  updateFolderAsync (doc: Metadata, old: Metadata): Promise<void>;
  moveAsync (doc: Metadata, from: Metadata): Promise<void>;
  assignNewRemote (doc: Metadata): Promise<void>;
  trashAsync (doc: Metadata): Promise<void>;
  deleteFolderAsync (doc: Metadata): Promise<void>;
}
*/
