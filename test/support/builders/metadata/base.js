/* @flow */

const _ = require('lodash')

const {
  assignId,
  assignPlatformIncompatibilities,
  id
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
  doc: Metadata
  */

  constructor (pouch /*: ?Pouch */) {
    this.pouch = pouch
    this.doc = {
      _id: id('foo'),
      docType: 'folder', // To make flow happy (overridden by subclasses)
      path: 'foo',
      remote: {
        _id: pouchdbBuilders.id(),
        _rev: pouchdbBuilders.rev()
      },
      tags: [],
      sides: {},
      updated_at: timestamp.stringify(timestamp.current())
    }
  }

  rev (rev /*: string */) /*: this */ {
    this.doc._rev = rev
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
    this.doc.ino = ino
    return this
  }

  stats ({ino, mtime, ctime} /*: fs.Stats */) /*: this */ {
    return this.ino(ino).updatedAt(timestamp.maxDate(mtime, ctime))
  }

  path (path /*: string */) /*: this */ {
    this.doc.path = path
    assignId(this.doc)
    return this
  }

  trashed () /*: this */ {
    this.doc.trashed = true
    return this
  }

  updatedAt (date /*: Date */) /*: this */ {
    this.doc.updated_at = timestamp.fromDate(date).toISOString()
    return this
  }

  newerThan (doc /*: Metadata */) /*: this */ {
    this.doc.updated_at = new Date(timestamp.fromDate(doc.updated_at) + 2000)
    return this
  }

  olderThan (doc /*: Metadata */) /*: this */ {
    this.doc.updated_at = new Date(timestamp.fromDate(doc.updated_at) - 2000)
    return this
  }

  remoteId (_id /*: string */) /*: this */ {
    this.doc.remote = {
      _id,
      _rev: pouchdbBuilders.rev()
    }
    return this
  }

  upToDate () /*: this */ {
    this.doc.sides = {local: 2, remote: 2}
    return this
  }

  notUpToDate () /*: this */ {
    this.doc.sides = {remote: 1}
    return this
  }

  sides (sides /*: MetadataSidesInfo */) /*: this */ {
    this.doc.sides = sides
    return this
  }

  build () /*: Metadata */ {
    // Don't detect incompatibilities according to syncPath for test data, to
    // prevent environment related failures.
    assignPlatformIncompatibilities(this.doc, '')

    return _.cloneDeep(this.doc)
  }

  async create () /*: Promise<Metadata> */ {
    if (this.pouch == null) {
      throw new Error('Cannot create dir metadata without Pouch')
    }
    const doc = this.build()
    // $FlowFixMe
    const { rev } = await this.pouch.put(doc)
    doc._rev = rev
    return doc
  }
}
