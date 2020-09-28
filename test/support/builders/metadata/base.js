/* @flow */

const _ = require('lodash')
const path = require('path')

const metadata = require('../../../../core/metadata')

const dbBuilders = require('../db')
const statsBuilder = require('../stats')

/*::
import type fs from 'fs-extra'
import type {
  Metadata,
  MetadataRemoteInfo,
  MetadataSidesInfo,
} from '../../../../core/metadata'
import type { Pouch } from '../../../../core/pouch'
import type { RemoteDoc } from '../../../../core/remote/document'
import type { SideName } from '../../../../core/side'
*/

const SOME_MEANINGLESS_TIME_OFFSET = 2000 // 2 seconds

module.exports = class BaseMetadataBuilder {
  /*::
  pouch: ?Pouch
  doc: Object
  buildLocal: boolean
  */

  constructor(pouch /*: ?Pouch */, old /*: ?Metadata */) {
    this.pouch = pouch
    if (old) {
      this.doc = _.cloneDeep(old)
    } else {
      const doc /*: Object */ = {
        _id: metadata.id('foo'),
        docType: 'folder', // To make flow happy (overridden by subclasses)
        path: 'foo',
        remote: {
          _id: dbBuilders.id(),
          _rev: dbBuilders.rev()
        },
        tags: [],
        updated_at: new Date().toISOString()
      }
      this.doc = doc
    }
    this.buildLocal = false // Default docType is folder
  }

  fromRemote(remoteDoc /*: RemoteDoc */) /*: this */ {
    this.doc = metadata.fromRemoteDoc(remoteDoc)
    metadata.ensureValidPath(this.doc)
    this._assignId()
    return this
  }

  moveFrom(was /*: Metadata */) /*: this */ {
    this.doc.moveFrom = _.defaultsDeep({ moveTo: this.doc._id }, was)
    this.noRev()
    return this
  }

  /** Make sure the doc is not the same as before. */
  whateverChange() /*: this */ {
    this.doc.tags = this.doc.tags || []
    this.doc.tags.push('changed-tag')
    return this
  }

  unmerged(sideName /*: SideName */) /*: this */ {
    if (this.doc.docType === 'file') delete this.doc.sides
    if (sideName === 'local') this.noRemote()
    return this.noRev()
  }

  rev(rev /*: string */) /*: this */ {
    this.doc._rev = rev
    return this
  }

  noRev() /*: this */ {
    delete this.doc._rev
    return this
  }

  noRemote() /*: this */ {
    /*
     * $FlowFixMe Flow is lying to us when allowing metadata's buildFile and
     * buildDir to set remote to undefined
     */
    this.doc.remote = undefined
    return this
  }

  noLocal() /*: this */ {
    this.buildLocal = false
    if (this.doc.local) delete this.doc.local
    return this
  }

  incompatible() /*: this */ {
    const { platform } = process

    if (platform === 'win32' || platform === 'darwin') {
      // Colon is currently considered forbidden on both platforms by the app
      // (although it probably shouldn't on macOS).
      return this.path('in:compatible')
    } else {
      throw new Error(`Cannot build incompatible doc on ${platform}`)
    }
  }

  ino(ino /*: number */) /*: this */ {
    if (process.platform === 'win32') {
      this.doc.fileid = statsBuilder.fileIdFromNumber(ino)
    }
    this.doc.ino = ino
    return this
  }

  noFileid() /*: this */ {
    delete this.doc.fileid
    return this
  }

  stats({ ino, mtime } /*: fs.Stats */) /*: this */ {
    return this.ino(ino).updatedAt(mtime)
  }

  path(newPath /*: string */) /*: this */ {
    this.doc.path = path.normalize(newPath)
    metadata.ensureValidPath(this.doc)
    this._assignId()
    return this
  }

  overwrite(existingDoc /*: Metadata */) /*: this */ {
    this.doc.overwrite = existingDoc
    return this
  }

  trashed() /*: this */ {
    this.doc.trashed = true
    return this
  }

  deleted() /*: this */ {
    this.doc.deleted = true
    return this
  }

  erased() /*: this */ {
    this.doc._deleted = true
    return this
  }

  updatedAt(date /*: string|Date */) /*: this */ {
    this.doc.updated_at = typeof date === 'string' ? date : date.toISOString()
    return this
  }

  newerThan(doc /*: Metadata */) /*: this */ {
    this.doc.updated_at = new Date(
      new Date(doc.updated_at).getTime() + SOME_MEANINGLESS_TIME_OFFSET
    ).toISOString()
    return this
  }

  olderThan(doc /*: Metadata */) /*: this */ {
    this.doc.updated_at = new Date(
      new Date(doc.updated_at).getTime() - SOME_MEANINGLESS_TIME_OFFSET
    ).toISOString()
    return this
  }

  remoteId(_id /*: string */) /*: this */ {
    this.doc.remote = {
      _id,
      _rev: dbBuilders.rev()
    }
    return this
  }

  remoteRev(shortRev /*: number */) /*: this */ {
    this.doc.remote._rev = dbBuilders.rev(shortRev)
    return this
  }

  upToDate() /*: this */ {
    this.doc.sides = {
      ...this.doc.sides,
      target: (this.doc.sides && this.doc.sides.target) || 1
    }
    metadata.markAsUpToDate(this.doc)
    return this
  }

  notUpToDate() /*: this */ {
    this.doc.sides = { target: 1, remote: 1 }
    return this
  }

  changedSide(side /*: SideName */) /*: this */ {
    metadata.markSide(side, this.doc, this.doc)
    return this
  }

  sides({
    local,
    remote
  } /*: { local?: number, remote?: number } */ = {}) /*: this */ {
    const sides /*: MetadataSidesInfo */ = {
      target: Math.max(local || 0, remote || 0)
    }
    if (local) sides.local = local
    if (remote) sides.remote = remote
    this.doc.sides = sides
    return this
  }

  noSides() /*: this */ {
    delete this.doc.sides
    return this
  }

  tags(...tags /*: string[] */) /*: this */ {
    this.doc.tags = tags
    return this
  }

  noTags() /*: this */ {
    delete this.doc.tags
    return this
  }

  errors(count /*: number */) /*: this */ {
    this.doc.errors = count
    return this
  }

  build() /*: Metadata */ {
    // Don't detect incompatibilities according to syncPath for test data, to
    // prevent environment related failures.
    metadata.assignPlatformIncompatibilities(this.doc, '')

    if (this.buildLocal && metadata.isAtLeastUpToDate('local', this.doc)) {
      metadata.updateLocal(this.doc)
    }

    return _.cloneDeep(this.doc)
  }

  async create() /*: Promise<Metadata> */ {
    const { pouch } = this
    if (pouch == null) {
      throw new Error('Cannot create dir metadata without Pouch')
    }

    const doc = this.build()
    doc.sides = doc.sides || { local: 1 }
    doc.sides.target = Math.max(doc.sides.local || 0, doc.sides.remote || 0)

    const { rev: newRev } = await pouch.db.put(doc)
    doc._rev = newRev

    return doc
  }

  _assignId() /* void */ {
    metadata.assignId(this.doc)

    if (this.doc.moveFrom) {
      this.doc.moveFrom.moveTo = this.doc._id
    }
  }
}
