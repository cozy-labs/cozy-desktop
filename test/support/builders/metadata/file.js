/* @flow */

import type { Metadata } from '../../../../core/metadata'

const BaseMetadataBuilder = require('./base')
const { assignId } = require('../../../../core/metadata')

const pouchdbBuilders = require('../pouchdb')

module.exports = class FileMetadataBuilder extends BaseMetadataBuilder {
  build (): Metadata {
    const doc = {
      ...this.opts,
      _id: '',
      // _rev: pouchdbBuilders.rev(),
      docType: 'file',
      remote: {
        _id: pouchdbBuilders.id(),
        _rev: pouchdbBuilders.rev()
      },
      tags: [],
      updated_at: new Date()
    }
    assignId(doc)
    return doc
  }
}
