/* @flow */

/*::
import type { SideName, Metadata } from './metadata'

export interface Side {
  addFileAsync (doc: Metadata): Promise<void>;
  addFolderAsync (doc: Metadata): Promise<void>;
  overwriteFileAsync (doc: Metadata, old: ?Metadata): Promise<void>;
  updateFileMetadataAsync (doc: Metadata, old: Metadata): Promise<void>;
  updateFolderAsync (doc: Metadata, old: Metadata): Promise<void>;
  moveFileAsync (doc: Metadata, from: Metadata): Promise<void>;
  moveFolderAsync (doc: Metadata, from: Metadata): Promise<void>;
  assignNewRev (doc: Metadata): Promise<void>;
  trashAsync (doc: Metadata): Promise<void>;
  deleteFolderAsync (doc: Metadata): Promise<void>;
  renameConflictingDocAsync (doc: Metadata, newPath: string): Promise<void>;
}
*/

module.exports = {
  otherSide
}

function otherSide(side /*: SideName */) /*: SideName */ {
  switch (side) {
    case 'local':
      return 'remote'
    case 'remote':
      return 'local'
    default:
      throw new Error(`Invalid side name: ${JSON.stringify(side)}`)
  }
}
