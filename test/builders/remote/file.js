/* @flow */

import fs from 'fs'
import path from 'path'
import * as stream from 'stream'
import { Cozy } from 'cozy-client-js'

import RemoteBaseBuilder from './base'

import { jsonApiToRemoteDoc } from '../../../src/remote/document'

import type { RemoteDoc } from '../../../src/remote/document'

// Used to generate readable unique filenames
var fileNumber = 1

// Create a remote file for testing purpose:
//
//     let remoteFile = this.builders.remoteFile().inDir(...).build()
//
export default class RemoteFileBuilder extends RemoteBaseBuilder {
  _data: string | stream.Readable

  constructor (cozy: Cozy) {
    super(cozy)

    this._data = `Content of remote file ${fileNumber}`

    Object.assign(this.options, {
      name: `remote-file-${fileNumber++}`,
      contentType: undefined
    })
  }

  contentType (contentType: string): RemoteFileBuilder {
    this.options.contentType = contentType
    return this
  }

  data (data: string | stream.Readable): RemoteFileBuilder {
    this._data = data
    return this
  }

  dataFromFile (path: string): RemoteFileBuilder {
    this._data = fs.createReadStream(path)
    return this
  }

  async create (): Promise<RemoteDoc> {
    let doc = jsonApiToRemoteDoc(
      await this.cozy.files.create(this._data, this.options)
    )

    const parentDir = await this.cozy.files.statById(doc.dir_id)
    doc.path = path.join(parentDir.attributes.path, doc.name)

    return doc
  }
}
