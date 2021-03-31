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
  Metadata,
  MetadataRemoteInfo,
  MetadataRemoteFile,
  MetadataRemoteDir,
  MetadataSidesInfo,
  SavedMetadata,
} from '../../../../core/metadata'
import type { Pouch } from '../../../../core/pouch'
import type { RemoteDoc } from '../../../../core/remote/document'
import type { SideName } from '../../../../core/side'
import type RemoteBaseBuilder from '../remote/base'
*/

const SOME_MEANINGLESS_TIME_OFFSET = 2000 // 2 seconds

const localIsUpToDate = (doc /*: Metadata */) /*: boolean %checks */ => {
  return _.isEqual(doc.local, _.pick(doc, metadata.LOCAL_ATTRIBUTES))
}

const remoteIsUpToDate = (doc /*: Metadata */) /*: boolean %checks */ => {
  // Update the checked attributes if needed
  return (
    // This `normalize` method is not the same as `path.normalize()`. It
    // normalizes characters and not path separators and such.
    doc.remote.path.normalize() ===
      pathUtils.localToRemote(doc.path).normalize() &&
    (doc.remote.type === 'file' ? doc.remote.md5sum === doc.md5sum : true)
  )
}

module.exports = class BaseMetadataBuilder {
  /*::
  pouch: ?Pouch
  doc: $Shape<Metadata>
  buildLocal: boolean
  buildRemote: boolean
  _remoteBuilder: ?*
  */

  constructor(pouch /*: ?Pouch */, old /*: ?Metadata */) {
    this.pouch = pouch
    if (old) {
      this.doc = _.cloneDeep(old)
    } else {
      this.doc = {
        docType: 'folder', // To make flow happy (overridden by subclasses)
        path: 'foo',
        tags: [],
        updated_at: new Date().toISOString()
      }
    }
    this.buildLocal = true
    this.buildRemote = true
  }

  fromRemote(remoteDoc /*: MetadataRemoteInfo */) /*: this */ {
    this.buildRemote = true
    this.doc = metadata.fromRemoteDoc(remoteDoc)
    this._consolidatePaths()
    return this
  }

  moveTo(docpath /*: string */) /*: this */ {
    this.doc.moveTo = path.normalize(docpath)
    this.doc._deleted = true
    return this
  }

  moveFrom(was /*: Metadata */) /*: this */ {
    if (!was.moveTo) throw new Error('Missing moveTo attribute on was')

    this.doc = _.cloneDeep(_.omit(was, ['_id', '_rev', '_deleted', 'moveTo']))
    this.doc.moveFrom = was

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
    this.doc._rev = rev
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

  overwrite(existingDoc /*: SavedMetadata */) /*: this */ {
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

  build() /*: Metadata */ {
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

    if (this.doc.overwrite && this.doc.moveFrom) {
      // Emulate the _id reuse done when merging an overwriting move.
      const { _id, _rev } = this.doc.overwrite
      this.doc._id = _id
      this.doc._rev = _rev
    }

    return _.cloneDeep(this.doc)
  }

  async create() /*: Promise<SavedMetadata> */ {
    const { pouch } = this
    if (pouch == null) {
      throw new Error('Cannot create dir metadata without Pouch')
    }

    const doc = this.build()
    if (doc.sides) {
      doc.sides.target = Math.max(doc.sides.local || 0, doc.sides.remote || 0)
    }

    return await pouch.put(doc)
  }

  _consolidatePaths() /* void */ {
    metadata.ensureValidPath(this.doc)
    if (this.doc.moveFrom) {
      this.doc.moveFrom.moveTo = this.doc.path
    }
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

  // XXX: This method will create a remote object with the correct schema but
  // its attributes won't necessarily match those of the created Metadata
  // object, especially those of files.
  // The proper way to create those two objects is to firt generate a remote
  // object and then use the `fromRemote()` method.
  _ensureRemote() /*: void */ {
    if (
      this.doc.remote != null &&
      (!this.doc.sides ||
        (!this.doc.sides.local ||
          (this.doc.sides.remote &&
            (this.doc.sides.remote < this.doc.sides.local ||
              remoteIsUpToDate(this.doc)))))
    ) {
      return
    }

    if (this._remoteBuilder == null) {
      if (this.doc.docType === 'file') {
        // $FlowFixMe We assume this.doc.remote is a remoteFile
        this._remoteBuilder = new RemoteFileBuilder(null, this.doc.remote)
      } else {
        // $FlowFixMe We assume this.doc.remote is a remoteDir
        this._remoteBuilder = new RemoteDirBuilder(null, this.doc.remote)
      }
    }

    let builder = this._remoteBuilder
      .name(path.basename(this.doc.path))
      .createdAt(...timestamp.spread(this.doc.updated_at))
      .updatedAt(...timestamp.spread(this.doc.updated_at))

    if (this.doc.docType === 'file') {
      builder = builder
        // $FlowFixMe those methods exist in RemoteFileBuilder
        .data(this._data)
        .executable(this.doc.executable)
        .contentType(this.doc.mime || '')
    }

    this.doc.remote = builder.build()
    this.doc.remote.path = pathUtils.localToRemote(this.doc.path)
  }
}
