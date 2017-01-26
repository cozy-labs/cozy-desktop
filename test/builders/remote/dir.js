import { ROOT_DIR_ID } from '../../../src/remote/constants'

// Used to generate readable unique dirnames
var dirNumber = 1

// Create a remote directory for testing purpose
//
//     let dir = builders.dir().build()
//
export default class RemoteDirBuilder {
  constructor (cozy) {
    this.cozy = cozy
    this.options = {
      name: `directory-${dirNumber++}`,
      dirID: ROOT_DIR_ID
    }
  }

  build () {
    return this.cozy.files.createDirectory(this.options)
  }
}
