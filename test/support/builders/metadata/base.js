/* @flow */

const _ = require('lodash')

const metadata = require('../../../../core/metadata')
const timestamp = require('../../../../core/timestamp')

const dbBuilders = require('../db')

/*::
import type fs from 'fs-extra'
import type {
  Metadata,
  MetadataRemoteInfo,
  MetadataSidesInfo,
  SideName
} from '../../../../core/metadata'
import type Pouch from '../../../../core/pouch'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

module.exports = class BaseMetadataBuilder {
  /*::
  pouch: ?Pouch
  doc: Metadata
  old: ?Metadata
  */

  constructor (pouch /*: ?Pouch */, old /*: ?Metadata */) {
    this.pouch = pouch
    if (old) {
      this.old = old
      this.doc = _.cloneDeep(old)
    } else {
      this.doc = {
        _id: metadata.id('foo'),
        docType: 'folder', // To make flow happy (overridden by subclasses)
        path: 'foo',
        remote: {
          _id: dbBuilders.id(),
          _rev: dbBuilders.rev()
        },
        tags: [],
        sides: {},
        updated_at: timestamp.stringify(timestamp.current())
      }
    }
  }

  fromRemote (remoteDoc /*: RemoteDoc */) /*: this */ {
    this.doc = metadata.fromRemoteDoc(remoteDoc)
    metadata.ensureValidPath(this.doc)
    metadata.assignId(this.doc)
    return this
  }

  /** Make sure the doc is not the same as before. */
  whateverChange () /*: this */ {
    this.doc.tags = this.doc.tags || []
    this.doc.tags.push('changed-tag')
    return this
  }

  unmerged (sideName /*: SideName */) /*: this */ {
    delete this.sides
    if (sideName === 'local') this.noRemote()
    return this.noRev()
  }

  rev (rev /*: string */) /*: this */ {
    this.doc._rev = rev
    return this
  }

  noRev () /*: this */ {
    delete this.doc._rev
    return this
  }

  noRemote () /*: this */ {
    delete this.doc.remote
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
    metadata.assignId(this.doc)
    return this
  }

  overwrite (existingDoc /*: Metadata */) /*: this */ {
    this.doc.overwrite = existingDoc
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
    this.doc.updated_at = new Date(timestamp.fromDate(doc.updated_at).getTime() + 2000)
    return this
  }

  olderThan (doc /*: Metadata */) /*: this */ {
    this.doc.updated_at = new Date(timestamp.fromDate(doc.updated_at).getTime() - 2000)
    return this
  }

  remoteId (_id /*: string */) /*: this */ {
    this.doc.remote = {
      _id,
      _rev: dbBuilders.rev()
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

  changedSide (side /*: SideName */) /*: this */ {
    metadata.markSide(side, this.doc, this.old)
    return this
  }

  sides (sides /*: MetadataSidesInfo */) /*: this */ {
    this.doc.sides = sides
    return this
  }

  build () /*: Metadata */ {
    // Don't detect incompatibilities according to syncPath for test data, to
    // prevent environment related failures.
    metadata.assignPlatformIncompatibilities(this.doc, '')

    return _.cloneDeep(this.doc)
  }

  async create () /*: Promise<Metadata> */ {
    const doc = this.build()
    if (this.pouch == null) {
      throw new Error('Cannot create dir metadata without Pouch')
    }
    const { rev } = await this.pouch.put(doc)
    doc._rev = rev
    return doc
  }
}
