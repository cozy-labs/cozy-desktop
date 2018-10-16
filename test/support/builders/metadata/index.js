/* @flow */

const DirMetadataBuilder = require('./dir')
const FileMetadataBuilder = require('./file')

/*::
import type { Metadata } from '../../../../core/metadata'
import type Pouch from '../../../../core/pouch'
import type BaseMetadataBuilder from './base'
*/

module.exports = class MetadataBuilders {
  /*::
  pouch: ?Pouch
  */

  constructor (pouch /*: ?Pouch */) {
    this.pouch = pouch
  }

  dir (old /*: ?Metadata */) /*: DirMetadataBuilder */ {
    return new DirMetadataBuilder(this.pouch, old)
  }

  file (old /*: ?Metadata */) /*: FileMetadataBuilder */ {
    return new FileMetadataBuilder(this.pouch, old)
  }

  whatever () /*: BaseMetadataBuilder */ {
    // FIXME: Find a better way to test both doctypes, possibly combined
    return this.dir()
  }
}
