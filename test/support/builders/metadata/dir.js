// @flow

const metadata = require('../../../../core/metadata')
const path = require('path')
const timestamp = require('../../../../core/utils/timestamp')

const BaseMetadataBuilder = require('./base')
const RemoteDirBuilder = require('../remote/dir')

/*::
import type { DirMetadata, DocType, Saved } from '../../../../core/metadata'
import type { Pouch } from '../../../../core/pouch'
*/

module.exports = class DirMetadataBuilder extends (
  BaseMetadataBuilder
) /*::<DirMetadata> */ {
  constructor(pouch /*: ?Pouch */, old /*: ?DirMetadata|Saved<DirMetadata> */) {
    super(pouch, old)
    this.doc.docType = 'folder'
  }

  _ensureRemote() /*: void */ {
    if (!super._shouldUpdateRemote()) {
      return
    }

    let builder /*: any */
    if (this._remoteBuilder == null) {
      this._remoteBuilder = new RemoteDirBuilder(
        null,
        this.doc.remote && this.doc.remote.type === 'directory'
          ? this.doc.remote
          : null
      )
    }

    builder = this._remoteBuilder
      .name(path.basename(this.doc.path))
      .createdAt(...timestamp.spread(this.doc.updated_at))
      .updatedAt(...timestamp.spread(this.doc.updated_at))
      .tags(...this.doc.tags)

    if (this.doc.trashed) {
      builder = builder.trashed()
    }

    this.doc.remote = metadata.serializableRemote(builder.build())
    //this.doc.remote.path = pathUtils.localToRemote(this.doc.path)
  }

  async create() /*: Promise<Saved<DirMetadata>> */ {
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
