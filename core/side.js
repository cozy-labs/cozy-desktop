/* @flow */

/*::
import type { SideName, Metadata } from './metadata'

export interface Side {
  addFileAsync (doc: Metadata): Promise<*>;
  addFolderAsync (doc: Metadata): Promise<*>;
  overwriteFileAsync (doc: Metadata, old: ?Metadata): Promise<*>;
  updateFileMetadataAsync (doc: Metadata, old: Metadata): Promise<*>;
  updateFolderAsync (doc: Metadata, old: Metadata): Promise<*>;
  moveFileAsync (doc: Metadata, from: Metadata): Promise<*>;
  moveFolderAsync (doc: Metadata, from: Metadata): Promise<*>;
  assignNewRev (doc: Metadata): Promise<*>;
  trashAsync (doc: Metadata): Promise<*>;
  deleteFolderAsync (doc: Metadata): Promise<*>;
  renameConflictingDocAsync (doc: Metadata, newPath: string): Promise<void>;
}
*/

module.exports = {
  otherSide
}

function otherSide (side /*: SideName */) /*: SideName */ {
  switch (side) {
    case 'local': return 'remote'
    case 'remote': return 'local'
    default: throw new Error(`Invalid side name: ${JSON.stringify(side)}`)
  }
}
