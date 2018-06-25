/* @flow */

const { maxDate } = require('../../../../core/timestamp')

/*::
import type fs from 'fs-extra'
import type { Metadata, MetadataSidesInfo } from '../../../../core/metadata'
import type Pouch from '../../../../core/pouch'
*/

module.exports = class BaseMetadataBuilder {
  /*::
  pouch: ?Pouch
  opts: {
    path: string,
    ino?: number,
    updated_at?: string|Date,
    trashed?: true,
    sides: MetadataSidesInfo
  }
  */

  constructor (pouch /*: ?Pouch */) {
    this.pouch = pouch
    this.opts = {
      path: 'foo',
      sides: {},
      updated_at: new Date().toISOString()
    }
  }

  ino (ino /*: number */) /*: this */ {
    this.opts.ino = ino
    return this
  }

  stats ({ino, mtime, ctime} /*: fs.Stats */) /*: this */ {
    return this.ino(ino).updatedAt(maxDate(mtime, ctime))
  }

  path (path /*: string */) /*: this */ {
    this.opts.path = path
    return this
  }

  trashed () /*: this */ {
    this.opts.trashed = true
    return this
  }

  updatedAt (date /*: Date */) /*: this */ {
    date = new Date(date)
    date.setMilliseconds(0)
    this.opts.updated_at = date.toISOString()
    return this
  }

  upToDate () /*: this */ {
    this.opts.sides = {local: 1, remote: 1}
    return this
  }

  notUpToDate () /*: this */ {
    this.opts.sides = {remote: 1}
    return this
  }

  build () /*: Metadata */ {
    throw new Error('BaseMetadataBuilder#build() not implemented')
  }

  async create () /*: Promise<Metadata> */ {
    if (this.pouch == null) {
      throw new Error('Cannot create dir metadata without Pouch')
    }
    const doc = this.build()
    // $FlowFixMe
    const {rev} = await this.pouch.put(doc)
    doc._rev = rev
    return doc
  }
}
