/* @flow */

import { Cozy } from 'cozy-client-js'

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
  cozy: Cozy

  constructor (cozy: Cozy) {
    this.cozy = cozy
  }

  remoteDir (): RemoteDirBuilder {
    return new RemoteDirBuilder(this.cozy)
  }

  remoteFile (): RemoteFileBuilder {
    return new RemoteFileBuilder(this.cozy)
  }

  stream (): StreamBuilder {
    return new StreamBuilder()
  }
}
