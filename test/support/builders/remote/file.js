/* @flow */

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

    this._data = `Content of remote file ${fileNumber}`

    Object.assign(this.options, {
      name: `remote-file-${fileNumber++}`,
      contentType: undefined
    })
  }

  contentType (contentType /*: string */) /*: RemoteFileBuilder */ {
    this.options.contentType = contentType
    return this
  }

  data (data /*: string | stream.Readable */) /*: RemoteFileBuilder */ {
    this._data = data
    return this
  }

  dataFromFile (path /*: string */) /*: RemoteFileBuilder */ {
    this._data = fs.createReadStream(path)
    return this
  }

  build () /*: RemoteDoc */ {
    return {
      ...super.build(),
      class: 'application',
      executable: true,
      md5sum: 'wVenkDHhxA+FkxgpvF/FUg==',
      mime: 'application/octet-stream',
      size: '123',
      type: 'file'
    }
  }

  async create () /*: Promise<RemoteDoc> */ {
    let doc = jsonApiToRemoteDoc(
      await this.cozy.files.create(this._data, {
        contentType: this.options.contentType,
        dirID: this.options.dir._id,
        lastModifiedDate: this.options.lastModifiedDate,
        name: this.options.name
      })
    )

    const parentDir = await this.cozy.files.statById(doc.dir_id)
    doc.path = path.join(parentDir.attributes.path, doc.name)

    return doc
  }
}
