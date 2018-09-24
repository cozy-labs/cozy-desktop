/* @flow */

const crypto = require('crypto')

const { createMetadata } = require('../../../../core/conversion')
const {
  assignId,
  ensureValidPath
} = require('../../../../core/metadata')

const BaseMetadataBuilder = require('./base')

/*::
import type Pouch from '../../../../core/pouch'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

module.exports = class FileMetadataBuilder extends BaseMetadataBuilder {
  constructor (pouch /*: ?Pouch */) {
    super(pouch)
    this.doc.docType = 'file'
    this.data('')
  }

  fromRemote (remoteDoc /*: RemoteDoc */) /*: this */ {
    this.doc = createMetadata(remoteDoc)
    ensureValidPath(this.doc)
    assignId(this.doc)
    return this
  }

  data (data /*: string */) /*: this */ {
    this.doc.size = Buffer.from(data).length
    this.doc.md5sum =
      crypto.createHash('md5').update(data).digest().toString('base64')
    return this
  }
}
