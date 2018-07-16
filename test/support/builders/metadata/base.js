/* @flow */

const _ = require('lodash')

const {
  assignId,
  assignPlatformIncompatibilities
} = require('../../../../core/metadata')
const timestamp = require('../../../../core/timestamp')

const pouchdbBuilders = require('../pouchdb')

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
      updated_at: timestamp.current()
    }
  }

  ino (ino /*: number */) /*: this */ {
    this.opts.ino = ino
    return this
  }

  stats ({ino, mtime, ctime} /*: fs.Stats */) /*: this */ {
    return this.ino(ino).updatedAt(timestamp.maxDate(mtime, ctime))
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
    this.opts.updated_at = timestamp.fromDate(date).toISOString()
    return this
  }

  newerThan (doc /*: Metadata */) /*: this */ {
    this.opts.updated_at = new Date(timestamp.fromDate(doc.updated_at) + 2000)
    return this
  }

  olderThan (doc /*: Metadata */) /*: this */ {
    this.opts.updated_at = new Date(timestamp.fromDate(doc.updated_at) - 2000)
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

  attributesByType () /*: * */ {
    throw new Error('BaseMetadataBuilder#attributesByType() not implemented')
  }

  build () /*: Metadata */ {
    const doc = _.merge({
      _id: '',
      remote: {
        _id: pouchdbBuilders.id(),
        _rev: pouchdbBuilders.rev()
      },
      tags: [],
      updated_at: new Date()
    }, this.opts, this.attributesByType())

    assignId(doc)
    // Don't detect incompatibilities according to syncPath for test data, to
    // prevent environment related failures.
    assignPlatformIncompatibilities(doc, '')

    return doc
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
