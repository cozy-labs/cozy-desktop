/* @flow */

const mime = require('../../../../core/utils/mime')
const metadata = require('../../../../core/metadata')
const path = require('path')
const timestamp = require('../../../../core/utils/timestamp')

const BaseMetadataBuilder = require('./base')
const ChecksumBuilder = require('../checksum')
const RemoteFileBuilder = require('../remote/file')

/*::
import type { Pouch } from '../../../../core/pouch'
import type { DocType, FileMetadata, Saved } from '../../../../core/metadata'
*/

module.exports = class FileMetadataBuilder extends (
  BaseMetadataBuilder
) /*::<FileMetadata> */ {
  /*::
  _data: string | Buffer
  */

  constructor(
    pouch /*: ?Pouch */,
    old /*: ?FileMetadata|Saved<FileMetadata> */
  ) {
    super(pouch, old)

    const mimeType = mime.lookup(this.doc.path)

    this.doc.docType = 'file'
    this.doc.mime = mimeType
    this.doc.class = mimeType.split('/')[0]
    this.doc.executable = old ? old.executable : false

    if (this.doc.md5sum == null) {
      this.data('')
    }
    this.buildLocal = true
  }

  data(data /*: string | Buffer */) /*: this */ {
    this._data = data
    this.doc.size = Buffer.from(data).length
    this.doc.md5sum = new ChecksumBuilder(data).build()
    return this
  }

  type(mime /*: string */) /*: this */ {
    this.doc.class = mime.split('/')[0]
    this.doc.mime = mime
    return this
  }

  // Should only be used to build invalid docs. Prefer using `data()`.
  md5sum(newMd5sum /*: ?string */) /*: this */ {
    if (newMd5sum) {
      this.doc.md5sum = newMd5sum
    } else {
      delete this.doc.md5sum
    }
    return this
  }

  // Should only be used to build invalid docs. Prefer using `data()`.
  size(newSize /*: number */) /*: this */ {
    this.doc.size = newSize
    return this
  }

  executable(isExecutable /*: boolean */) /*: this */ {
    this.doc.executable = isExecutable
    return this
  }

  _doctype() /*: DocType */ {
    return 'file'
  }

  _ensureRemote() /*: void */ {
    if (!super._shouldUpdateRemote()) {
      return
    }

    let builder /*: any */
    if (this._remoteBuilder == null) {
      this._remoteBuilder = new RemoteFileBuilder(
        null,
        this.doc.remote && this.doc.remote.type === 'file'
          ? this.doc.remote
          : null
      )
    }

    builder = this._remoteBuilder
      .name(path.basename(this.doc.path))
      .createdAt(...timestamp.spread(this.doc.updated_at))
      .updatedAt(...timestamp.spread(this.doc.updated_at))
      .tags(...this.doc.tags)
      .data(this._data)
      .executable(this.doc.executable)
      .contentType(this.doc.mime || '')
      .md5sum(this.doc.md5sum)
      .size(String(this.doc.size))

    if (this.doc.trashed) {
      builder = builder.trashed()
    }

    this.doc.remote = metadata.serializableRemote(builder.build())
    //this.doc.remote.path = pathUtils.localToRemote(this.doc.path)
  }

  async create() /*: Promise<Saved<FileMetadata>> */ {
    const { pouch } = this
    if (pouch == null) {
      throw new Error('Cannot create dir metadata without Pouch')
    }

    const doc = this.build()
    if (doc.sides) {
      doc.sides.target = Math.max(doc.sides.local || 0, doc.sides.remote || 0)
    }

    if (this.doc.overwrite) {
      const { overwrite } = this.doc
      await pouch.eraseDocument(overwrite)
    }
    return await pouch.put(doc)
  }
}
