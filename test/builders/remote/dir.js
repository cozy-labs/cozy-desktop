/* @flow */

import { Cozy } from 'cozy-client-js'

import RemoteBaseBuilder from './base'
import { jsonApiToRemoteDoc } from '../../../src/remote/document'

import type { RemoteDoc } from '../../../src/remote/document'

// Used to generate readable unique dirnames
var dirNumber = 1

// Create a remote directory for testing purpose
//
//     let dir = builders.dir().build()
//
export default class RemoteDirBuilder extends RemoteBaseBuilder {
  constructor (cozy: Cozy) {
    super(cozy)

    Object.assign(this.options, {
      name: `directory-${dirNumber++}`
    })
  }

  build (): RemoteDoc {
    return {
      ...super.build(),
      type: 'directory'
    }
  }

  async create (): Promise<RemoteDoc> {
    return jsonApiToRemoteDoc(
      await this.cozy.files.createDirectory({
        name: this.options.name,
        dirID: this.options.dir._id,
        lastModifiedDate: this.options.lastModifiedDate
      })
    )
  }
}
