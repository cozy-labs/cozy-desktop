/* @flow */

const DirMetadataBuilder = require('./metadata/dir')
const FileMetadataBuilder = require('./metadata/file')
const RemoteDirBuilder = require('./remote/dir')
const RemoteFileBuilder = require('./remote/file')
const StreamBuilder = require('./stream')

/*::
import type { Cozy } from 'cozy-client-js'
import type { Metadata } from '../../../core/metadata'
import type Pouch from '../../../core/pouch'
import type { Warning } from '../../../core/remote/warning'
*/

// Test data builders facade.
//
//     builders.metafile()...
//     builders.remoteDir()...
//     builders.stream()...
//
module.exports = class Builders {
  /*::
  cozy: ?Cozy
  pouch: ?Pouch
  */

  constructor ({cozy, pouch} /*: {cozy?: Cozy, pouch?: Pouch} */ = {}) {
    this.cozy = cozy
    this.pouch = pouch
  }

  metadata () /*: DirMetadataBuilder|FileMetadataBuilder */ {
    return this.metadir()
  }

  metadir (old /*: ?Metadata */) /*: DirMetadataBuilder */ {
    return new DirMetadataBuilder(this.pouch, old)
  }

  metafile (old /*: ?Metadata */) /*: FileMetadataBuilder */ {
    return new FileMetadataBuilder(this.pouch, old)
  }

  remoteDir () /*: RemoteDirBuilder */ {
    return new RemoteDirBuilder(this.cozy)
  }

  remoteFile () /*: RemoteFileBuilder */ {
    return new RemoteFileBuilder(this.cozy)
  }

  remoteWarnings () /*: Warning[] */ {
    return [
      {
        error: 'tos-updated',
        title: 'TOS Updated',
        detail: 'TOS have been updated',
        links: {
          self: 'https://manager.cozycloud.cc/cozy/tos?domain=...'
        }
      }
    ]
  }

  stream () /*: StreamBuilder */ {
    return new StreamBuilder()
  }
}
