/* @flow */

import fs from 'fs'
import { Cozy } from 'cozy-client-js'

import RemoteBaseBuilder from './base'

import type { RemoteDoc } from '../../../src/remote/document'

// Used to generate readable unique filenames
var fileNumber = 1

// Create a remote file for testing purpose:
//
//     let remoteFile = this.builders.remoteFile().inDir(...).build()
//
export default class RemoteFileBuilder extends RemoteBaseBuilder {
  _data: string | Buffer

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

  data (data: string | Buffer): RemoteFileBuilder {
    this._data = data
    return this
  }

  dataFromFile (path: string): RemoteFileBuilder {
    this._data = fs.readFileSync(path)
    return this
  }

  async build (): Promise<RemoteDoc> {
    return this.toRemoteMetadata(
      await this.cozy.files.create(this._data, this.options)
    )
  }
}
