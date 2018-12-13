/* @flow */

const MetadataBuilders = require('./metadata')
const RemoteDirBuilder = require('./remote/dir')
const RemoteFileBuilder = require('./remote/file')
const StreamBuilder = require('./stream')

/*::
import type { Cozy } from 'cozy-client-js'
import type Pouch from '../../../core/pouch'
*/

// Test data builders facade.
//
//     builders.metadata.file()...
//     builders.remote.dir()...
//     builders.stream()...
//
module.exports = class Builders {
  /*::
  cozy : ?Cozy
  metadata: MetadataBuilders
  */

  constructor ({cozy, pouch} /*: {cozy?: Cozy, pouch?: Pouch} */ = {}) {
    this.cozy = cozy
    this.metadata = new MetadataBuilders(pouch)
  }

  get remote () /*: * */ {
    return {
      dir: () => new RemoteDirBuilder(this.cozy),
      file: () => new RemoteFileBuilder(this.cozy)
    }
  }

  stream () /*: StreamBuilder */ {
    return new StreamBuilder()
  }
}
