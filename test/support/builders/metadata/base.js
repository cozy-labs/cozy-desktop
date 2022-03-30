/* @flow */

const _ = require('lodash')
const path = require('path')

const metadata = require('../../../../core/metadata')
const timestamp = require('../../../../core/utils/timestamp')
const pathUtils = require('../../../../core/utils/path')

const RemoteFileBuilder = require('../remote/file')
const RemoteDirBuilder = require('../remote/dir')
const dbBuilders = require('../db')
const statsBuilder = require('../stats')

/*::
import type fs from 'fs-extra'
import type {
  DirMetadata,
  DocType,
  FileMetadata,
  Metadata,
  MetadataSidesInfo,
  Saved,
  SavedMetadata,
} from '../../../../core/metadata'
import type { Pouch, PouchRecord } from '../../../../core/pouch'
import type { RemoteDir, RemoteFile } from '../../../../core/remote/document'
import type { SideName } from '../../../../core/side'
import type RemoteBaseBuilder from '../remote/base'
*/

const SOME_MEANINGLESS_TIME_OFFSET = 2000 // 2 seconds

const localIsUpToDate = (doc /*: Metadata */) /*: boolean %checks */ => {
  return metadata.equivalentLocal(doc, doc.local)
}

const remoteIsUpToDate = (doc /*: Metadata */) /*: boolean %checks */ => {
  return metadata.equivalentRemote(doc, doc.remote)
}

module.exports = class BaseMetadataBuilder /*::<T: Metadata> */ {
  /*::
  pouch: ?Pouch
  doc: T
  buildLocal: boolean
  buildRemote: boolean
  _remoteBuilder: ?*
  */

  constructor(pouch /*: ?Pouch */, old /*: ?T|Saved<T> */) {
    this.pouch = pouch
    if (old) {
      this.doc = _.cloneDeep(old)
    } else {
      // $FlowFixMe missing attributes are added later
      this.doc = {
        docType: 'folder', // Overriden by sub-builders
        path: 'foo',
        tags: [],
        updated_at: new Date().toISOString(),
        needsContentFetching: false
      }
    }
    this.buildLocal = true
    this.buildRemote = true
  }

  fromRemote(remoteDoc /*: RemoteDir|RemoteFile */) /*: this */ {
    this.buildRemote = true
    const fromRemote /*: any */ = metadata.fromRemoteDoc(remoteDoc)
    this.doc = (fromRemote /*: T */)
    this._consolidatePaths()
    return this
  }

  moveFrom(
    was /*: SavedMetadata */,
    { childMove = false } /*: { childMove?: boolean } */ = {}
  ) /*: this */ {
    this.doc = {
      ..._.cloneDeep(was),
      ...this.doc
    }
    this.doc.moveFrom = was
    if (childMove) this.doc.moveFrom.childMove = true

    return this
  }

  /** Make sure the doc is not the same as before. */
  whateverChange() /*: this */ {
    this.doc.tags = this.doc.tags || []
    this.doc.tags.push('changed-tag')
    return this
  }

  unmerged(sideName /*: SideName */) /*: this */ {
    if (sideName === 'remote') {
      this.noLocal()
      this.buildRemote = true
    }
    if (sideName === 'local') {
      this.noRemote()
      this.buildLocal = true
    }
    this.noSides()
    this.noRecord()
    delete this.doc.moveFrom
    delete this.doc.overwrite
    return this
  }

  noRecord() /*: this */ {
    if (this.doc._id) delete this.doc._id
    if (this.doc._rev) delete this.doc._rev
    return this
  }

  noRemote() /*: this */ {
    this.buildRemote = false
    if (this.doc.remote) delete this.doc.remote
    return this
  }

  noLocal() /*: this */ {
    this.buildLocal = false
    if (this.doc.local) delete this.doc.local
    return this
  }

  rev(rev /*: string */) /*: this */ {
    if (this.doc._rev) this.doc._rev = rev
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
    this._consolidatePaths()
    return this
  }

  overwrite(
    existingDoc /*: Saved<DirMetadata>|Saved<FileMetadata> */
  ) /*: this */ {
    this.doc.overwrite = _.cloneDeep(existingDoc)
    return this
  }

  trashed() /*: this */ {
    this.doc.trashed = true
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

  newerThan(
    doc /*: Metadata|Saved<DirMetadata>|Saved<FileMetadata> */
  ) /*: this */ {
    this.doc.updated_at = new Date(
      new Date(doc.updated_at).getTime() + SOME_MEANINGLESS_TIME_OFFSET
    ).toISOString()
    return this
  }

  olderThan(
    doc /*: Metadata|Saved<DirMetadata>|Saved<FileMetadata> */
  ) /*: this */ {
    this.doc.updated_at = new Date(
      new Date(doc.updated_at).getTime() - SOME_MEANINGLESS_TIME_OFFSET
    ).toISOString()
    return this
  }

  remoteId(_id /*: string */) /*: this */ {
    this.buildRemote = true
    this._ensureRemote()

    this.doc.remote._id = _id
    return this
  }

  remoteRev(shortRev /*: number */) /*: this */ {
    this.buildRemote = true
    this._ensureRemote()

    this.doc.remote._rev = dbBuilders.rev(shortRev)
    return this
  }

  upToDate() /*: this */ {
    const target = (metadata.target(this.doc) || 1) + 1
    this.sides({ local: target, remote: target })
    return this
  }

  notUpToDate() /*: this */ {
    this.sides({ remote: 1 })
    return this
  }

  changedSide(side /*: SideName */) /*: this */ {
    if (this.doc.sides == null) this.upToDate()

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
    if (local) {
      this.buildLocal = true
      sides.local = local
    } else {
      this.noLocal()
    }
    if (remote) {
      this.buildRemote = true
      sides.remote = remote
    } else {
      this.noRemote()
    }
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
    this.doc.tags = []
    return this
  }

  errors(count /*: number */) /*: this */ {
    this.doc.errors = count
    return this
  }

  build() /*: T */ {
    // Don't detect incompatibilities according to syncPath for test data, to
    // prevent environment related failures.
    metadata.assignPlatformIncompatibilities(this.doc, '')

    if (this.buildLocal) {
      this._ensureLocal()
    } else {
      this.noLocal()
    }

    if (this.buildRemote) {
      this._ensureRemote()
    } else if (this.doc.remote) {
      this.noRemote()
    }

    return _.cloneDeep(this.doc)
  }

  _consolidatePaths() /* void */ {
    metadata.ensureValidPath(this.doc)
  }

  _ensureLocal() /*: void */ {
    if (
      this.doc.local != null &&
      this.doc.sides &&
      (!this.doc.sides.remote ||
        (this.doc.sides.local &&
          (this.doc.sides.local < this.doc.sides.remote ||
            localIsUpToDate(this.doc))))
    ) {
      return
    }

    metadata.updateLocal(this.doc)
  }

  _shouldUpdateRemote() /*: boolean */ {
    return !(
      this.doc.remote != null &&
      (!this.doc.sides ||
        !this.doc.sides.local ||
        (this.doc.sides.remote &&
          (this.doc.sides.remote < this.doc.sides.local ||
            remoteIsUpToDate(this.doc))))
    )
  }
}
