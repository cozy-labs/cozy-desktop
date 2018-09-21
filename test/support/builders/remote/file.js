/* @flow */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

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
//     const file /*: RemoteDoc */ = builders.remote.file().inDir(...).build()
//
// To actually create the corresponding file on the Cozy, use the async
// #create() method instead:
//
//     const file /*: RemoteDoc */ = await builders.remote.file().inDir(...).create()
//
module.exports = class RemoteFileBuilder extends RemoteBaseBuilder {
  /*::
  _data: string | stream.Readable
  */

  constructor (cozy /*: Cozy */) {
    super(cozy)

    this.doc.type = 'file'
    this.named(`remote-file-${fileNumber}`)
    this.data(`Content of remote file ${fileNumber}`)
    this.doc.class = 'application'
    this.doc.mime = 'application/octet-stream'
    this.doc.executable = true

    fileNumber++
  }

  contentType (contentType /*: string */) /*: RemoteFileBuilder */ {
    this.doc.mime = contentType
    return this
  }

  data (data /*: string | stream.Readable */) /*: RemoteFileBuilder */ {
    this._data = data
    if (typeof data === 'string') {
      this.doc.size = Buffer.from(data).length.toString()
      this.doc.md5sum =
        crypto.createHash('md5').update(data).digest().toString('base64')
    }
    // FIXME: Assuming doc will be created with data stream
    return this
  }

  dataFromFile (path /*: string */) /*: RemoteFileBuilder */ {
    return this.data(fs.createReadStream(path))
  }

  executable (isExecutable /*: boolean */) /*: RemoteFileBuilder */ {
    this.doc.executable = isExecutable
    return this
  }

  async create () /*: Promise<RemoteDoc> */ {
    const doc = jsonApiToRemoteDoc(
      await this.cozy.files.create(this._data, {
        contentType: this.doc.mime,
        dirID: this.doc.dir_id,
        executable: this.doc.executable,
        lastModifiedDate: this.doc.updated_at,
        name: this.doc.name
      })
    )

    const parentDir = await this.cozy.files.statById(doc.dir_id)
    doc.path = path.join(parentDir.attributes.path, doc.name)

    return doc
  }
}
