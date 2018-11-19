/* @flow */

const crypto = require('crypto')

const metadata = require('../../../../core/metadata')
const {
  assignId,
  ensureValidPath
} = metadata

const BaseMetadataBuilder = require('./base')

/*::
import type Pouch from '../../../../core/pouch'
import type { Metadata } from '../../../../core/metadata'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

module.exports = class FileMetadataBuilder extends BaseMetadataBuilder {
  constructor (pouch /*: ?Pouch */, old /*: ?Metadata */) {
    super(pouch, old)
    this.doc.docType = 'file'
    this.data('')
  }

  fromRemote (remoteDoc /*: RemoteDoc */) /*: this */ {
    this.doc = metadata.fromRemoteDoc(remoteDoc)
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
