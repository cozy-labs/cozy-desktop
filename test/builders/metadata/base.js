/* @flow */

import Pouch from '../../../core/pouch'

import type { Metadata, MetadataSidesInfo } from '../../../core/metadata'

export default class BaseMetadataBuilder {
  pouch: ?Pouch
  opts: {
    path: string,
    trashed?: true,
    sides: MetadataSidesInfo
  }

  constructor (pouch: ?Pouch) {
    this.pouch = pouch
    this.opts = {
      path: 'foo',
      sides: {}
    }
  }

  ino (ino: number): this {
    this.opts.ino = ino
    return this
  }

  path (path: string): this {
    this.opts.path = path
    return this
  }

  trashed (): this {
    this.opts.trashed = true
    return this
  }

  notUpToDate (): this {
    this.opts.sides = {remote: 1}
    return this
  }

  build (): Metadata {
    throw new Error('BaseMetadataBuilder#build() not implemented')
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
