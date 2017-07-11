/* @flow */

import BaseMetadataBuilder from './base'
import { buildId } from '../../../src/metadata'

import type { Metadata } from '../../../src/metadata'

import pouchdbBuilders from '../pouchdb'

export default class FileMetadataBuilder extends BaseMetadataBuilder {
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
      updated_at: '2017-06-08T15:09:52.000Z'
    }
    buildId(doc)
    return doc
  }
}
