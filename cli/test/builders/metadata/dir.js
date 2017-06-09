// @flow

import { buildId } from '../../../src/metadata'
import Pouch from '../../../src/pouch'

import type { Metadata } from '../../../src/metadata'

import pouchdbBuilders from '../pouchdb'

export default class DirMetadataBuilder {
  pouch: ?Pouch
  path: string

  constructor (pouch?: Pouch) {
    this.pouch = pouch
  }

  path (path: string): this {
    this.path = path
    return this
  }

  build (): Metadata {
    const doc = {
      _id: '',
      // _rev: pouchdbBuilders.rev(),
      docType: 'folder',
      path: this.path,
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
    buildId(doc)
    return doc
  }

  async create (): Promise<Metadata> {
    if (this.pouch == null) {
      throw new Error('Cannot create dir metadata without Pouch')
    }
    const doc = this.build()
    // $FlowFixMe
    await this.pouch.put(doc)
    return doc
  }
}
