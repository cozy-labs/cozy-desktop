/* @flow */

const crypto = require('crypto')
const fs = require('fs')
const { posix } = require('path')

const RemoteBaseBuilder = require('./base')
const cozyHelpers = require('../../helpers/cozy')

const { jsonApiToRemoteDoc } = require('../../../../core/remote/document')
const { FILES_DOCTYPE } = require('../../../../core/remote/constants')

/*::
import type stream from 'stream'
import type { Cozy } from 'cozy-client-js'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

// Used to generate readable unique filenames
var fileNumber = 1

const addReferencedBy = async (
  cozy /*: * */,
  remoteDoc /*: RemoteDoc */,
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

  constructor(cozy /*: Cozy */, old /*: ?RemoteDoc */) {
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

  contentType(contentType /*: string */) /*: RemoteFileBuilder */ {
    this.remoteDoc.mime = contentType
    return this
  }

  data(data /*: string | stream.Readable | Buffer */) /*: RemoteFileBuilder */ {
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

  dataFromFile(path /*: string */) /*: RemoteFileBuilder */ {
    return this.data(fs.createReadStream(path))
  }

  executable(isExecutable /*: boolean */) /*: RemoteFileBuilder */ {
    this.remoteDoc.executable = isExecutable
    return this
  }

  async create() /*: Promise<RemoteDoc> */ {
    const cozy = this._ensureCozy()

    const doc = jsonApiToRemoteDoc(
      await cozy.files.create(this._data, {
        contentType: this.remoteDoc.mime,
        dirID: this.remoteDoc.dir_id,
        executable: this.remoteDoc.executable,
        createdAt: this.remoteDoc.created_at,
        updatedAt: this.remoteDoc.updated_at || this.remoteDoc.created_at,
        name: this.remoteDoc.name
      })
    )

    // $FlowFixMe exists only in RemoteBuilders documents
    if (this.remoteDoc.referenced_by && this.remoteDoc.referenced_by.length) {
      const { _rev, referencedBy } = await addReferencedBy(
        cozy,
        doc,
        // $FlowFixMe exists only in RemoteBuilders documents
        this.remoteDoc.referenced_by
      )
      doc._rev = _rev
      // $FlowFixMe exists only in RemoteBuilders documents
      doc.referenced_by = referencedBy
    }

    const parentDir = await cozy.files.statById(doc.dir_id)
    doc.path = posix.join(parentDir.attributes.path, doc.name)

    return doc
  }

  async update() /*: Promise<RemoteDoc> */ {
    const cozy = this._ensureCozy()

    const doc = jsonApiToRemoteDoc(
      await cozy.files.updateById(this.remoteDoc._id, this._data, {
        contentType: this.remoteDoc.mime,
        dirID: this.remoteDoc.dir_id,
        executable: this.remoteDoc.executable,
        updatedAt: this.remoteDoc.updated_at,
        name: this.remoteDoc.name
      })
    )

    const parentDir = await cozy.files.statById(doc.dir_id)
    doc.path = posix.join(parentDir.attributes.path, doc.name)

    return doc
  }
}
