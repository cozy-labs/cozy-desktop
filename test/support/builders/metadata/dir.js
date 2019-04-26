// @flow

const BaseMetadataBuilder = require('./base')

/*::
import type { Metadata } from '../../../../core/metadata'
import type Pouch from '../../../../core/pouch'
*/

module.exports = class DirMetadataBuilder extends BaseMetadataBuilder {
  constructor(pouch /*: ?Pouch */, old /*: ?Metadata */) {
    super(pouch, old)
    this.doc.docType = 'folder'
  }
}
