/* @flow */

const crypto = require('crypto')
const fs = require('fs')
const { posix } = require('path')
const _ = require('lodash')

const RemoteBaseBuilder = require('./base')
const cozyHelpers = require('../../helpers/cozy')

const { jsonApiToRemoteDoc } = require('../../../../core/remote/document')
const { FILES_DOCTYPE } = require('../../../../core/remote/constants')

/*::
import type stream from 'stream'
import type { Cozy } from 'cozy-client-js'
import type { RemoteFile } from '../../../../core/remote/document'
import type { MetadataRemoteFile } from '../../../../core/metadata'
*/

// Used to generate readable unique filenames
var fileNumber = 1

const addReferencedBy = async (
  cozy /*: * */,
  remoteDoc /*: RemoteFile */,
  refs /*: Array<{ _id: string, _type: string }> */
) => {
  const client = await cozyHelpers.newClient(cozy)
  const files = client.collection(FILES_DOCTYPE)
  const doc = { _id: remoteDoc._id, _type: FILES_DOCTYPE }
  const {
    meta: { rev: _rev },
    data
  } = await files.addReferencedBy(doc, refs)
  return { _rev, referencedBy: data }
}
// Build a MetadataRemoteFile representing a remote Cozy file:
//
//     const file /*: MetadataRemoteFile */ = builders.remoteFile().inDir(...).build()
//
// To actually create the corresponding file on the Cozy, use the async
// #create() method instead:
//
//     const file /*: MetadataRemoteFile */ = await builders.remoteFile().inDir(...).create()
//
module.exports = class RemoteFileBuilder extends RemoteBaseBuilder /*:: <MetadataRemoteFile> */ {
  /*::
  _data: string | stream.Readable | Buffer
  */

  constructor(cozy /*: Cozy */, old /*: ?(RemoteFile|MetadataRemoteFile) */) {
    super(cozy, old)

    if (!old) {
      this.name(`remote-file-${fileNumber}`)
      this.data(`Content of remote file ${fileNumber}`)
      this.remoteDoc.class = 'application'
      this.remoteDoc.mime = 'application/octet-stream'
      this.remoteDoc.executable = true
    }
    this.remoteDoc.type = 'file'

    fileNumber++
  }

  contentType(contentType /*: string */) /*: this */ {
    this.remoteDoc.mime = contentType
    this.remoteDoc.class = contentType.split('/')[0]
    return this
  }

  data(data /*: string | stream.Readable | Buffer */) /*: this */ {
    this._data = data
    if (typeof data === 'string') {
      this.remoteDoc.size = Buffer.from(data).length.toString()
      this.remoteDoc.md5sum = crypto
        .createHash('md5')
        .update(data)
        .digest()
        .toString('base64')
    }
    // FIXME: Assuming doc will be created with data stream
    return this
  }

  // Should only be used to build invalid docs. Prefer using `data()`.
  size(newSize /*: string */) /*: this */ {
    this.remoteDoc.size = newSize
    return this
  }

  dataFromFile(path /*: string */) /*: this */ {
    return this.data(fs.createReadStream(path))
  }

  executable(isExecutable /*: boolean */) /*: this */ {
    this.remoteDoc.executable = isExecutable
    return this
  }

  async create() /*: Promise<MetadataRemoteFile> */ {
    const cozy = this._ensureCozy()

    const remoteFile /*: RemoteFile */ = _.clone(
      jsonApiToRemoteDoc(
        await cozy.files.create(this._data, {
          contentType: this.remoteDoc.mime,
          dirID: this.remoteDoc.dir_id,
          executable: this.remoteDoc.executable,
          createdAt: this.remoteDoc.created_at,
          updatedAt: this.remoteDoc.updated_at || this.remoteDoc.created_at,
          name: this.remoteDoc.name
        })
      )
    )

    if (this.remoteDoc.referenced_by && this.remoteDoc.referenced_by.length) {
      const { _rev } = await addReferencedBy(
        cozy,
        remoteFile,
        this.remoteDoc.referenced_by
      )
      remoteFile._rev = _rev
    }

    const parentDir = await cozy.files.statById(remoteFile.dir_id)
    const doc /*: MetadataRemoteFile */ = {
      ...remoteFile,
      path: posix.join(parentDir.attributes.path, remoteFile.name)
    }

    return doc
  }

  async update() /*: Promise<MetadataRemoteFile> */ {
    const cozy = this._ensureCozy()

    const parentDir = await cozy.files.statById(this.remoteDoc.dir_id)
    const remoteFile /*: RemoteFile */ = _.clone(
      jsonApiToRemoteDoc(
        await cozy.files.updateById(this.remoteDoc._id, this._data, {
          contentType: this.remoteDoc.mime,
          dirID: this.remoteDoc.dir_id,
          executable: this.remoteDoc.executable,
          updatedAt: this.remoteDoc.updated_at,
          name: this.remoteDoc.name
        })
      )
    )
    const doc /*: MetadataRemoteFile */ = {
      ...remoteFile,
      path: posix.join(parentDir.attributes.path, this.remoteDoc.name)
    }

    return doc
  }
}
