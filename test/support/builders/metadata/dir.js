// @flow

const BaseMetadataBuilder = require('./base')

/*::
import type Pouch from '../../../../core/pouch'
*/

module.exports = class DirMetadataBuilder extends BaseMetadataBuilder {
  constructor (pouch /*: ?Pouch */) {
    super(pouch)
    this.doc.docType = 'folder'
  }
}
