/* @flow */

const fs = require('fs')

const RemoteBaseBuilder = require('./base')
const { FILES_DOCTYPE } = require('../../../../core/remote/constants')
const {
  inRemoteTrash,
  jsonApiToRemoteDoc
} = require('../../../../core/remote/document')
const cozyHelpers = require('../../helpers/cozy')
const ChecksumBuilder = require('../checksum')

/*::
import type stream from 'stream'
import type { Cozy } from 'cozy-client-js'
import type { CozyClient } from 'cozy-client'
import type { FullRemoteFile, RemoteFile } from '../../../../core/remote/document'
*/

// Used to generate readable unique filenames
var fileNumber = 1

const addReferencedBy = async (
  client /*: CozyClient */,
  remoteDoc /*: RemoteFile */,
  refs /*: Array<{ _id: string, _type: string }> */
) => {
  const files = client.collection(FILES_DOCTYPE)
  const doc = { _id: remoteDoc._id, _type: FILES_DOCTYPE }
  const {
    meta: { rev: _rev },
    data
  } = await files.addReferencedBy(doc, refs)
  return { _rev, referencedBy: data }
}

const baseData = `Content of remote file ${fileNumber}`

// Build a FullRemoteFile representing a remote Cozy file:
//
//     const file /*: FullRemoteFile */ = builders.remoteFile().inDir(...).build()
//
// To actually create the corresponding file on the Cozy, use the async
// #create() method instead:
//
//     const file /*: FullRemoteFile */ = await builders.remoteFile().inDir(...).create()
//
module.exports = class RemoteFileBuilder extends RemoteBaseBuilder /*:: <FullRemoteFile> */ {
  /*::
  _data: string | stream.Readable | Buffer
  */

  constructor(cozy /*: ?Cozy */, old /*: ?FullRemoteFile */) {
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

  trashed() /*: this */ {
    this.remoteDoc.trashed = true
    return super.trashed()
  }

  restored() /*: this */ {
    this.remoteDoc.trashed = false
    return super.restored()
  }

  async create() /*: Promise<FullRemoteFile> */ {
    const cozy = this._ensureCozy()
    const client = await cozyHelpers.newClient(cozy)

    const { data: file } = await client.collection(FILES_DOCTYPE).createFile(
      this._data,
      {
        contentType: this.remoteDoc.mime,
        dirId: this.remoteDoc.dir_id,
        executable: this.remoteDoc.executable,
        lastModifiedDate:
          this.remoteDoc.updated_at || this.remoteDoc.created_at,
        name: this.remoteDoc.name
      },
      {
        sanitizeName: false
      }
    )
    const remoteFile /*: RemoteFile */ = jsonApiToRemoteDoc(file)

    if (this.remoteDoc.referenced_by && this.remoteDoc.referenced_by.length) {
      const { _rev } = await addReferencedBy(
        client,
        remoteFile,
        this.remoteDoc.referenced_by
      )
      remoteFile._rev = _rev
    }

    const doc /*: FullRemoteFile */ = {
      ...remoteFile,
      path: this.remoteDoc.path
    }

    return doc
  }

  async update() /*: Promise<FullRemoteFile> */ {
    const cozy = this._ensureCozy()
    const client = await cozyHelpers.newClient(cozy)
    const files = client.collection(FILES_DOCTYPE)

    const { data: file } = inRemoteTrash(this.remoteDoc)
      ? await files.destroy(this.remoteDoc)
      : this._data
      ? await files.updateFile(
          this._data,
          {
            fileId: this.remoteDoc._id,
            name: this.remoteDoc.name,
            contentType: this.remoteDoc.mime,
            contentLength: this.remoteDoc.size,
            checksum: this.remoteDoc.md5sum,
            executable: this.remoteDoc.executable,
            lastModifiedDate: this.remoteDoc.updated_at
          },
          {
            sanitizeName: false
          }
        )
      : await files.updateAttributes(
          this.remoteDoc._id,
          {
            dir_id: this.remoteDoc.dir_id,
            name: this.remoteDoc.name,
            executable: this.remoteDoc.executable,
            updated_at: this.remoteDoc.updated_at
          },
          {
            sanitizeName: false
          }
        )
    const remoteFile /*: RemoteFile */ = jsonApiToRemoteDoc(file)
    const doc /*: FullRemoteFile */ = {
      ...remoteFile,
      path: this.remoteDoc.path
    }

    return doc
  }
}
