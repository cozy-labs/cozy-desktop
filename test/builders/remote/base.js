/* @flow */

import { Cozy } from 'cozy-client-js'

import { ROOT_DIR_ID } from '../../../src/remote/constants'

import type { RemoteDoc } from '../../../src/remote/document'

export default class RemoteBaseBuilder {
  cozy: Cozy
  options: Object

  constructor (cozy: Cozy) {
    this.cozy = cozy
    this.options = {
      dirID: ROOT_DIR_ID
    }
  }

  inDir (dir: RemoteDoc): this {
    this.options.dirID = dir._id
    return this
  }

  inRootDir (): this {
    this.options.dirID = ROOT_DIR_ID
    return this
  }

  named (name: string): this {
    this.options.name = name
    return this
  }
}
