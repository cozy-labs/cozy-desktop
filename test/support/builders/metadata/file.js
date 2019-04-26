/* @flow */

const mime = require('mime')
const crypto = require('crypto')

const BaseMetadataBuilder = require('./base')

/*::
import type Pouch from '../../../../core/pouch'
import type { Metadata } from '../../../../core/metadata'
*/

module.exports = class FileMetadataBuilder extends BaseMetadataBuilder {
  constructor(pouch /*: ?Pouch */, old /*: ?Metadata */) {
    super(pouch, old)

    const mimeType = mime.lookup(this.doc.path)

    this.doc.docType = 'file'
    this.doc.mime = mimeType
    this.doc.class = mimeType.split('/')[0]

    if (this.doc.md5sum == null) {
      this.data('')
    }
  }

  data(data /*: string */) /*: this */ {
    this.doc.size = Buffer.from(data).length
    this.doc.md5sum = crypto
      .createHash('md5')
      .update(data)
      .digest()
      .toString('base64')
    return this
  }
}
