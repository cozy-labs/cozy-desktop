/* @flow */

const { posix } = require('path')
const _ = require('lodash')

const RemoteBaseBuilder = require('./base')
const ChecksumBuilder = require('../checksum')
const cozyHelpers = require('../../helpers/cozy')

const { remoteJsonToRemoteDoc } = require('../../../../core/remote/document')
const {
  FILES_DOCTYPE,
  NOTE_MIME_TYPE
} = require('../../../../core/remote/constants')

/*::
import type stream from 'stream'
import type { Cozy } from 'cozy-client'
import type { RemoteFile } from '../../../../core/remote/document'
import type { MetadataRemoteFile } from '../../../../core/metadata'
*/

// Used to generate readable unique filenames
var fileNumber = 1

const baseMetadata = {
  content: {},
  schema: {},
  title: 'My note title',
  version: 1
}

// Build a MetadataRemoteFile representing a remote Cozy Note:
//
//     const note /*: MetadataRemoteFile */ = builders.remoteNote().inDir(...).build()
//
// To actually create the corresponding note on the Cozy, use the async
// #create() method instead:
//
//     const note /*: MetadataRemoteFile */ = await builders.remoteNote().inDir(...).create()
//
module.exports = class RemoteNoteBuilder extends RemoteBaseBuilder /*:: <MetadataRemoteFile> */ {
  /*::
  _title: string
  _content: string
  _data: string
  */

  constructor(cozy /*: Cozy */, old /*: ?(RemoteFile|MetadataRemoteFile) */) {
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
    this.remoteDoc.md5sum = new ChecksumBuilder(this._data).build()
  }

  build() /*: Object */ {
    this._updateMetadata()
    this._updateExport()

    return super.build()
  }

  async create() /*: Promise<MetadataRemoteFile> */ {
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
      createdAt: this.remoteDoc.created_at,
      updatedAt: this.remoteDoc.updated_at || this.remoteDoc.created_at,
      noSanitize: true
    })
    const remoteFile /*: RemoteFile */ = _.clone(remoteJsonToRemoteDoc(data))
    remoteFile._rev = data.meta.rev

    const { data: parentDir } = await files.statById(remoteFile.dir_id)
    const doc /*: MetadataRemoteFile */ = {
      ...remoteFile,
      path: posix.join(parentDir.attributes.path, remoteFile.name)
    }

    return doc
  }

  async update() /*: Promise<MetadataRemoteFile> */ {
    this._updateMetadata()
    this._updateExport()

    const cozy = this._ensureCozy()

    // FIXME: use new cozy-client updateFile() method once we can pass something
    // else than HTML5 File objects as data.
    // FIXME: update note metadata
    const remoteFile /*: RemoteFile */ = _.clone(
      remoteJsonToRemoteDoc(
        await cozy.files.updateById(this.remoteDoc._id, this._data, {
          dirID: this.remoteDoc.dir_id,
          updatedAt: this.remoteDoc.updated_at,
          name: this.remoteDoc.name,
          noSanitize: true
        })
      )
    )

    const parentDir = await cozy.files.statById(remoteFile.dir_id)
    const doc /*: MetadataRemoteFile */ = {
      ...remoteFile,
      path: posix.join(parentDir.attributes.path, remoteFile.name)
    }

    return doc
  }
}
