// @flow

const { assignId } = require('../../../../core/metadata')
const BaseMetadataBuilder = require('./base')

const pouchdbBuilders = require('../pouchdb')

/*::
import type { Metadata } from '../../../../core/metadata'
*/

module.exports = class DirMetadataBuilder extends BaseMetadataBuilder {
  build () /*: Metadata */ {
    const doc = {
      ...this.opts,
      _id: '',
      // _rev: pouchdbBuilders.rev(),
      docType: 'folder',
      remote: {
        _id: pouchdbBuilders.id(),
        _rev: pouchdbBuilders.rev()
      },
      sides: {
        local: 1,
        remote: 1
      },
      tags: [],
      updated_at: new Date()
    }
    assignId(doc)
    return doc
  }
}
