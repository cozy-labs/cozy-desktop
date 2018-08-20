// @flow

const _ = require('lodash')

const {
  markSide
} = require('../../../../core/metadata')

const BaseMetadataBuilder = require('./base')

/*::
import type {
  Metadata,
  SideName
} from '../../../../core/metadata'
import type Pouch from '../../../../core/pouch'
*/

/** Build changed metadata from existing ones */
module.exports = class ChangedMetadataBuilder extends BaseMetadataBuilder {
  /*::
  doc: Metadata
  old: Metadata
  */

  constructor (pouch /*: ?Pouch */, old /*: Metadata */) {
    super(pouch)

    this.old = old
    this.doc = _.cloneDeep(old)

    // Since we don't ensure tags are unique, the easiest way to make sure
    // both dir and file metadata are different is to add another tag.
    this.doc.tags.push('changed-tag')
  }

  /** Mark the changed side */
  onSide (side /*: SideName */) /*: this */ {
    markSide(side, this.doc, this.old)
    return this
  }

  build () {
    return this.doc
  }
}
