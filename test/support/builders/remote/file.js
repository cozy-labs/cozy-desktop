/* @flow */

const fs = require('fs')
const { posix } = require('path')
const _ = require('lodash')

const RemoteBaseBuilder = require('./base')
const ChecksumBuilder = require('../checksum')
const cozyHelpers = require('../../helpers/cozy')

const { remoteJsonToRemoteDoc } = require('../../../../core/remote/document')
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

const baseData = `Content of remote file ${fileNumber}`

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

  constructor(cozy /*: ?Cozy */, old /*: ?(RemoteFile|MetadataRemoteFile) */) {
    super(cozy, old)

    if (!old) {
      this.name(`remote-file-${fileNumber}`)
      this.data(baseData)
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
      this.size(Buffer.from(data).length.toString())
      this.md5sum(new ChecksumBuilder(data).build())
    }
    // FIXME: Assuming doc will be created with data stream
    return this
  }

  // Should only be used to build invalid docs or in other builders.
  // Prefer using `data()`.
  md5sum(newMd5sum /*: ?string */) /*: this */ {
    if (newMd5sum) {
      this.remoteDoc.md5sum = newMd5sum
    } else {
      this.remoteDoc.md5sum = new ChecksumBuilder(baseData).build()
    }
    return this
  }

  // Should only be used to build invalid docs or in other builders.
  // Prefer using `data()`.
  size(newSize /*: ?string */) /*: this */ {
    if (newSize) {
      this.remoteDoc.size = newSize
    } else {
      this.remoteDoc.size = Buffer.from(baseData).length.toString()
    }
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
      remoteJsonToRemoteDoc(
        await cozy.files.create(this._data, {
          contentType: this.remoteDoc.mime,
          dirID: this.remoteDoc.dir_id,
          executable: this.remoteDoc.executable,
          createdAt: this.remoteDoc.created_at,
          updatedAt: this.remoteDoc.updated_at || this.remoteDoc.created_at,
          name: this.remoteDoc.name,
          noSanitize: true
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

    const json = this.remoteDoc.trashed
      ? await cozy.files.trashById(this.remoteDoc._id, { dontRetry: true })
      : this._data
      ? await cozy.files.updateById(this.remoteDoc._id, this._data, {
          contentType: this.remoteDoc.mime,
          contentLength: this.remoteDoc.size,
          checksum: this.remoteDoc.md5sum,
          executable: this.remoteDoc.executable,
          updatedAt: this.remoteDoc.updated_at,
          noSanitize: true
        })
      : await cozy.files.updateAttributesById(this.remoteDoc._id, {
          dir_id: this.remoteDoc.dir_id,
          name: this.remoteDoc.name,
          executable: this.remoteDoc.executable,
          updated_at: this.remoteDoc.updated_at,
          noSanitize: true
        })
    const remoteFile /*: RemoteFile */ = _.clone(remoteJsonToRemoteDoc(json))
    const doc /*: MetadataRemoteFile */ = {
      ...remoteFile,
      path: posix.join(parentDir.attributes.path, this.remoteDoc.name)
    }

    return doc
  }
}
