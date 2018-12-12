/* @flow */

const crypto = require('crypto')
const fs = require('fs')
const { posix } = require('path')

const RemoteBaseBuilder = require('./base')

const { jsonApiToRemoteDoc } = require('../../../../core/remote/document')

/*::
import type stream from 'stream'
import type { Cozy } from 'cozy-client-js'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

// Used to generate readable unique filenames
var fileNumber = 1

// Build a RemoteDoc representing a remote Cozy file:
//
//     const file /*: RemoteDoc */ = builders.remoteFile().inDir(...).build()
//
// To actually create the corresponding file on the Cozy, use the async
// #create() method instead:
//
//     const file /*: RemoteDoc */ = await builders.remoteFile().inDir(...).create()
//
module.exports = class RemoteFileBuilder extends RemoteBaseBuilder {
  /*::
  _data: string | stream.Readable | Buffer
  */

  constructor (cozy /*: Cozy */, old /*: ?RemoteDoc */) {
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

  contentType (contentType /*: string */) /*: RemoteFileBuilder */ {
    this.remoteDoc.mime = contentType
    return this
  }

  data (data /*: string | stream.Readable | Buffer */) /*: RemoteFileBuilder */ {
    this._data = data
    if (typeof data === 'string') {
      this.remoteDoc.size = Buffer.from(data).length.toString()
      this.remoteDoc.md5sum =
        crypto.createHash('md5').update(data).digest().toString('base64')
    }
    // FIXME: Assuming doc will be created with data stream
    return this
  }

  dataFromFile (path /*: string */) /*: RemoteFileBuilder */ {
    return this.data(fs.createReadStream(path))
  }

  executable (isExecutable /*: boolean */) /*: RemoteFileBuilder */ {
    this.remoteDoc.executable = isExecutable
    return this
  }

  async create () /*: Promise<RemoteDoc> */ {
    const cozy = this._ensureCozy()

    const doc = jsonApiToRemoteDoc(
      await cozy.files.create(this._data, {
        contentType: this.remoteDoc.mime,
        dirID: this.remoteDoc.dir_id,
        executable: this.remoteDoc.executable,
        lastModifiedDate: this.remoteDoc.updated_at,
        name: this.remoteDoc.name
      })
    )

    const parentDir = await cozy.files.statById(doc.dir_id)
    doc.path = posix.join(parentDir.attributes.path, doc.name)

    return doc
  }
}
