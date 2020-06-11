/* @flow */

const crypto = require('crypto')
const { posix } = require('path')

const RemoteBaseBuilder = require('./base')
const cozyHelpers = require('../../helpers/cozy')

const { jsonApiToRemoteDoc } = require('../../../../core/remote/document')
const {
  FILES_DOCTYPE,
  NOTE_MIME_TYPE
} = require('../../../../core/remote/constants')

/*::
import type stream from 'stream'
import type { Cozy } from 'cozy-client'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

// Used to generate readable unique filenames
var fileNumber = 1

const baseMetadata = {
  content: {},
  schema: {},
  title: 'My note title',
  version: 1
}

// Build a RemoteDoc representing a remote Cozy Note:
//
//     const note /*: RemoteDoc */ = builders.remoteNote().inDir(...).build()
//
// To actually create the corresponding note on the Cozy, use the async
// #create() method instead:
//
//     const note /*: RemoteDoc */ = await builders.remoteNote().inDir(...).create()
//
module.exports = class RemoteNoteBuilder extends RemoteBaseBuilder {
  /*::
  _title: string
  _content: string
  _data: string
  */

  constructor(cozy /*: Cozy */, old /*: ?RemoteDoc */) {
    super(cozy, old)

    if (!old) {
      this.name(`remote-note-${fileNumber}`)
      this.data(`My note title\n\nContent of remote note ${fileNumber}`)
      this.remoteDoc.class = 'text'
      this.remoteDoc.mime = NOTE_MIME_TYPE
    } else {
      this.name(old.name)
      if (old.metadata) {
        this.data(old.metadata.content.content[0].content[0].text)
      }
    }
    this.remoteDoc.type = 'file'

    fileNumber++
  }

  data(text /*: string */) /*: RemoteNoteBuilder */ {
    this._content = text

    return this
  }

  name(filename /*: string */) /*: this */ {
    super.name(filename)
    this._title = filename.split('.cozy-note')[0]

    return this
  }

  _updateMetadata() {
    if (this.remoteDoc.metadata == null) {
      this.remoteDoc.metadata = baseMetadata
    }

    this.remoteDoc.metadata.title = this._title
    this.remoteDoc.metadata.content = {
      content: [
        {
          content: [
            {
              text: this._content,
              type: 'text'
            }
          ],
          type: 'paragraph'
        }
      ],
      type: 'doc'
    }
  }

  _updateExport() {
    this._data = `${this._title}\n\n${this._content}`
    this.remoteDoc.size = Buffer.from(this._data).length.toString()
    this.remoteDoc.md5sum = crypto
      .createHash('md5')
      .update(this._data)
      .digest()
      .toString('base64')
  }

  build() /*: Object */ {
    this._updateMetadata()
    this._updateExport()

    return super.build()
  }

  async create() /*: Promise<RemoteDoc> */ {
    this._updateMetadata()
    this._updateExport()

    const client = await cozyHelpers.newClient(this._ensureCozy())
    const files = client.collection(FILES_DOCTYPE)

    const { data } = await files.createFile(this._data, {
      name: this.remoteDoc.name,
      dirId: this.remoteDoc.dir_id,
      executable: this.remoteDoc.executable,
      metadata: this.remoteDoc.metadata,
      contentType: this.remoteDoc.mime,
      lastModifiedDate: this.remoteDoc.updated_at
    })
    const doc = jsonApiToRemoteDoc(data)
    doc._rev = data.meta.rev

    const { data: parentDir } = await files.statById(doc.dir_id)
    doc.path = posix.join(parentDir.attributes.path, doc.name)

    return doc
  }

  async update() /*: Promise<RemoteDoc> */ {
    this._updateMetadata()
    this._updateExport()

    const cozy = this._ensureCozy()

    // FIXME: use new cozy-client updateFile() method once we can pass something
    // else than HTML5 File objects as data.
    // FIXME: update note metadata
    const doc = jsonApiToRemoteDoc(
      await cozy.files.updateById(this.remoteDoc._id, this._data, {
        dirID: this.remoteDoc.dir_id,
        lastModifiedDate: this.remoteDoc.updated_at,
        name: this.remoteDoc.name
      })
    )

    const parentDir = await cozy.files.statById(doc.dir_id)
    doc.path = posix.join(parentDir.attributes.path, doc.name)

    return doc
  }
}
