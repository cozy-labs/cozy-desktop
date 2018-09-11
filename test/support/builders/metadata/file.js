/* @flow */

const _ = require('lodash')
const crypto = require('crypto')

const { createMetadata } = require('../../../../core/conversion')
const { ensureValidPath } = require('../../../../core/metadata')

const BaseMetadataBuilder = require('./base')

/*::
import type Pouch from '../../../../core/pouch'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

module.exports = class FileMetadataBuilder extends BaseMetadataBuilder {
  /*::
  fileOpts: {
    docType: 'file',
    size: number,
    md5sum: string
  }
  */

  constructor (pouch /*: ?Pouch */) {
    super(pouch)
    this.fileOpts = {
      docType: 'file',
      size: 0,
      md5sum: '1B2M2Y8AsgTpgAmY7PhCfg==' // empty
    }
  }

  fromRemote (remoteDoc /*: RemoteDoc */) /*: this */ {
    const doc = createMetadata(remoteDoc)
    ensureValidPath(doc)
    this.opts = _.pick(doc, _.keys(this.opts))
    return this
  }

  data (data /*: string */) /*: this */ {
    this.fileOpts.size = Buffer.from(data).length
    this.fileOpts.md5sum =
      crypto.createHash('md5').update(data).digest().toString('base64')
    return this
  }

  attributesByType () /*: * */ {
    return this.fileOpts
  }
}
