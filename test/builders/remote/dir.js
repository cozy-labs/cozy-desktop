/* @flow */

import { Cozy } from 'cozy-client-js'

import RemoteBaseBuilder from './base'

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

  async build (): Promise<RemoteDoc> {
    return this.toRemoteMetadata(
      await this.cozy.files.createDirectory(this.options)
    )
  }
}
