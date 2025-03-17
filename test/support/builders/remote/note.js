/* @flow */

const { posix } = require('path')

const RemoteBaseBuilder = require('./base')
const {
  FILES_DOCTYPE,
  NOTE_MIME_TYPE
} = require('../../../../core/remote/constants')
const { jsonApiToRemoteDoc } = require('../../../../core/remote/document')
const ChecksumBuilder = require('../checksum')

/*::
import type stream from 'stream'
import type { CozyClient } from 'cozy-client'
import type { FullRemoteFile, RemoteFile } from '../../../../core/remote/document'
*/

// Used to generate readable unique filenames
var fileNumber = 1

const baseMetadata = {
  content: {},
  schema: {},
  title: 'My note title',
  version: 1
}

// Build a FullRemoteFile representing a remote Cozy Note:
//
//     const note /*: FullRemoteFile */ = builders.remoteNote().inDir(...).build()
//
// To actually create the corresponding note on the Cozy, use the async
// #create() method instead:
//
//     const note /*: FullRemoteFile */ = await builders.remoteNote().inDir(...).create()
//
module.exports = class RemoteNoteBuilder extends RemoteBaseBuilder /*:: <FullRemoteFile> */ {
  /*::
  _title: string
  _content: string
  _data: string
  */

  constructor(client /*: CozyClient */, old /*: ?FullRemoteFile */) {
    super(client, old)

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

  async create() /*: Promise<FullRemoteFile> */ {
    this._updateMetadata()
    this._updateExport()

    const client = await this._ensureClient()
    const files = client.collection(FILES_DOCTYPE)

    const { data: file } = await files.createFile(
      this._data,
      {
        name: this.remoteDoc.name,
        dirId: this.remoteDoc.dir_id,
        executable: this.remoteDoc.executable,
        metadata: this.remoteDoc.metadata,
        contentType: this.remoteDoc.mime,
        lastModifiedDate: this.remoteDoc.updated_at || this.remoteDoc.created_at
      },
      {
        sanitizeName: false
      }
    )
    const remoteFile /*: RemoteFile */ = jsonApiToRemoteDoc(file)
    remoteFile._rev = file.meta.rev

    const { data: parentDir } = await files.statById(remoteFile.dir_id)
    const doc /*: FullRemoteFile */ = {
      ...remoteFile,
      path: posix.join(parentDir.attributes.path, remoteFile.name)
    }

    return doc
  }

  async update() /*: Promise<FullRemoteFile> */ {
    this._updateMetadata()
    this._updateExport()

    const client = await this._ensureClient()
    const files = client.collection(FILES_DOCTYPE)

    // FIXME: update note metadata
    const { data: file } = await files.updateFile(
      this._data,
      {
        fileId: this.remoteDoc._id,
        name: this.remoteDoc.name,
        dirId: this.remoteDoc.dir_id,
        lastModifiedDate: this.remoteDoc.updated_at
      },
      {
        sanitizeName: false
      }
    )
    const remoteFile /*: RemoteFile */ = jsonApiToRemoteDoc(file)

    const { data: parentDir } = await files.statById(remoteFile.dir_id)
    const doc /*: FullRemoteFile */ = {
      ...remoteFile,
      path: posix.join(parentDir.attributes.path, remoteFile.name)
    }

    return doc
  }
}
