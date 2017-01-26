import { ROOT_DIR_ID } from '../../../src/remote/constants'

// Used to generate readable unique filenames
var fileNumber = 1

// Create a remote file for testing purpose:
//
//     let remoteFile = this.builders.remoteFile().inDir(...).build()
//
export default class RemoteFileBuilder {
  constructor (cozy) {
    this.cozy = cozy
    this.data = `Content of remote file ${fileNumber}`
    this.options = {
      name: `remote-file-${fileNumber++}`,
      dirID: ROOT_DIR_ID,
      contentType: undefined
    }
  }

  inDir (dir) {
    this.options.dirID = dir.id
    return this
  }

  build () {
    return this.cozy.files.create(this.data, this.options)
  }
}
