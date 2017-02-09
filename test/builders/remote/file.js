import fs from 'fs'

import RemoteBaseBuilder from './base'

// Used to generate readable unique filenames
var fileNumber = 1

// Create a remote file for testing purpose:
//
//     let remoteFile = this.builders.remoteFile().inDir(...).build()
//
export default class RemoteFileBuilder extends RemoteBaseBuilder {
  constructor (cozy) {
    super(cozy)

    this._data = `Content of remote file ${fileNumber}`

    Object.assign(this.options, {
      name: `remote-file-${fileNumber++}`,
      contentType: undefined
    })
  }

  contentType (contentType) {
    this.options.contentType = contentType
    return this
  }

  data (data) {
    this._data = data
    return this
  }

  dataFromFile (path) {
    this._data = fs.readFileSync(path)
    return this
  }

  async build () {
    return this.toRemoteMetadata(
      await this.cozy.files.create(this._data, this.options)
    )
  }
}
