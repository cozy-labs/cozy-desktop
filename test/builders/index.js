import RemoteDirBuilder from './remote/dir'
import RemoteFileBuilder from './remote/file'
import StreamBuilder from './stream'

// Instanciate test data builders with their dependencies.
//
// Accessible as `this.builders` in tests:
//
//     this.builders.dir()...
//     this.builders.file()...
//
export class BuilderFactory {
  constructor (cozy) {
    this.cozy = cozy
  }

  dir () {
    return new RemoteDirBuilder(this.cozy)
  }

  file () {
    return new RemoteFileBuilder(this.cozy)
  }

  stream () {
    return new StreamBuilder()
  }
}
