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

    this.data = `Content of remote file ${fileNumber}`

    Object.assign(this.options, {
      name: `remote-file-${fileNumber++}`,
      contentType: undefined
    })
  }

  async build () {
    return this.toRemoteMetadata(
      await this.cozy.files.create(this.data, this.options)
    )
  }
}
