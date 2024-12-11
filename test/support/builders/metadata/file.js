/* @flow */

const BaseMetadataBuilder = require('./base')
const mime = require('../../../../core/utils/mime')
const ChecksumBuilder = require('../checksum')

/*::
import type { Pouch } from '../../../../core/pouch'
import type { Metadata } from '../../../../core/metadata'
*/

module.exports = class FileMetadataBuilder extends BaseMetadataBuilder {
  /*::
  _data: string | Buffer
  */

  constructor(pouch /*: ?Pouch */, old /*: ?Metadata */) {
    super(pouch, old)

    const mimeType = mime.lookup(this.doc.path)

    this.doc.docType = 'file'
    this.doc.mime = mimeType
    this.doc.class = mimeType.split('/')[0]
    this.doc.executable = old ? old.executable : false

    if (this.doc.md5sum == null) {
      this.data('')
    }
    this.buildLocal = true
  }

  data(data /*: string | Buffer */) /*: this */ {
    this._data = data
    this.doc.size = Buffer.from(data).length
    this.doc.md5sum = new ChecksumBuilder(data).build()
    return this
  }

  type(mime /*: string */) /*: this */ {
    this.doc.class = mime.split('/')[0]
    this.doc.mime = mime
    return this
  }

  // Should only be used to build invalid docs. Prefer using `data()`.
  md5sum(newMd5sum /*: ?string */) /*: this */ {
    if (newMd5sum) {
      this.doc.md5sum = newMd5sum
    } else {
      delete this.doc.md5sum
    }
    return this
  }

  // Should only be used to build invalid docs. Prefer using `data()`.
  size(newSize /*: number */) /*: this */ {
    this.doc.size = newSize
    return this
  }

  executable(isExecutable /*: boolean */) /*: this */ {
    this.doc.executable = isExecutable
    return this
  }
}
