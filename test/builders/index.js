/* @flow */

import type { Cozy } from 'cozy-client-js'

import type Pouch from '../../core/pouch'

import MetadataBuilders from './metadata'
import RemoteDirBuilder from './remote/dir'
import RemoteFileBuilder from './remote/file'
import StreamBuilder from './stream'

// Test data builders facade.
//
//     builders.metadata.file()...
//     builders.remote.dir()...
//     builders.stream()...
//
export default class Builders {
  cozy: Cozy
  metadata: MetadataBuilders

  constructor (cozy: Cozy, pouch?: Pouch) {
    this.cozy = cozy
    this.metadata = new MetadataBuilders(pouch)
  }

  get remote (): * {
    if (this.cozy == null) {
      throw new Error('Cannot create remote files/dirs without a Cozy client.')
      // TODO: Allow building RemoteDoc instances without a Cozy client
    }

    return {
      dir: () => new RemoteDirBuilder(this.cozy),
      file: () => new RemoteFileBuilder(this.cozy)
    }
  }

  stream (): StreamBuilder {
    return new StreamBuilder()
  }
}
