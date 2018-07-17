/* @flow */

const crypto = require('crypto')

const BaseMetadataBuilder = require('./base')

/*::
import type Pouch from '../../../../core/pouch'
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
