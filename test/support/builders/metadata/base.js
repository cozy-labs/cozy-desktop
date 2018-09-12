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
import type {
  Metadata,
  MetadataRemoteInfo,
  MetadataSidesInfo,
  SideName
} from '../../../../core/metadata'
import type Pouch from '../../../../core/pouch'
*/

module.exports = class BaseMetadataBuilder {
  /*::
  pouch: ?Pouch
  opts: {
    _rev?: string,
    path: string,
    ino?: number,
    remote: MetadataRemoteInfo,
    updated_at?: string|Date,
    trashed?: true,
    sides: MetadataSidesInfo
  }
  */

  constructor (pouch /*: ?Pouch */) {
    this.pouch = pouch
    this.opts = {
      path: 'foo',
      remote: {
        _id: pouchdbBuilders.id(),
        _rev: pouchdbBuilders.rev()
      },
      sides: {},
      updated_at: timestamp.stringify(timestamp.current())
    }
  }

  rev (rev /*: string */) /*: this */ {
    this.opts._rev = rev
    return this
  }

  incompatible () /*: this */ {
    const { platform } = process

    if (platform === 'win32' || platform === 'darwin') {
      // Colon is currently considered forbidden on both platforms by the app
      // (although it probably shouldn't on macOS).
      return this.path('in:compatible')
    } else {
      throw new Error(`Cannot build incompatible doc on ${platform}`)
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

  remoteId (_id /*: string */) /*: this */ {
    this.opts.remote = {
      _id,
      _rev: pouchdbBuilders.rev()
    }
    return this
  }

  upToDate () /*: this */ {
    this.opts.sides = {local: 2, remote: 2}
    return this
  }

  notUpToDate () /*: this */ {
    this.opts.sides = {remote: 1}
    return this
  }

  sides (sides /*: MetadataSidesInfo */) /*: this */ {
    this.opts.sides = sides
    return this
  }

  attributesByType () /*: * */ {
    throw new Error('BaseMetadataBuilder#attributesByType() not implemented')
  }

  build () /*: Metadata */ {
    const doc = _.merge({
      _id: '',
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
