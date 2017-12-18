// @flow

import { assignId } from '../../../core/metadata'
import BaseMetadataBuilder from './base'

import type { Metadata } from '../../../core/metadata'

import pouchdbBuilders from '../pouchdb'

export default class DirMetadataBuilder extends BaseMetadataBuilder {
  build (): Metadata {
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
      updated_at: '2017-06-08T15:09:52.000Z'
    }
    assignId(doc)
    return doc
  }
}
