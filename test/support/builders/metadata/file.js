/* @flow */

const crypto = require('crypto')
const _ = require('lodash')

const BaseMetadataBuilder = require('./base')
const { assignId } = require('../../../../core/metadata')

const pouchdbBuilders = require('../pouchdb')

/*::
import type Pouch from '../../../../core/pouch'
import type { Metadata } from '../../../../core/metadata'
*/

module.exports = class FileMetadataBuilder extends BaseMetadataBuilder {
  /*::
  fileOpts: {
    size: number,
    md5sum: string
  }
  */

  constructor (pouch /*: ?Pouch */) {
    super(pouch)
    this.fileOpts = {
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

  build () /*: Metadata */ {
    const doc = _.merge({
      _id: '',
      // _rev: pouchdbBuilders.rev(),
      docType: 'file',
      remote: {
        _id: pouchdbBuilders.id(),
        _rev: pouchdbBuilders.rev()
      },
      tags: []
    }, this.opts, this.fileOpts)
    assignId(doc)
    return doc
  }
}
