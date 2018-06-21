// @flow

const _ = require('lodash')

const { assignId } = require('../../../../core/metadata')
const BaseMetadataBuilder = require('./base')

const pouchdbBuilders = require('../pouchdb')

/*::
import type { Metadata } from '../../../../core/metadata'
*/

module.exports = class DirMetadataBuilder extends BaseMetadataBuilder {
  build () /*: Metadata */ {
    const doc = _.merge({
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
    }, this.opts)
    assignId(doc)
    return doc
  }
}
