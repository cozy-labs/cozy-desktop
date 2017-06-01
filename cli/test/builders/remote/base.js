/* @flow */

import { Cozy } from 'cozy-client-js'
import uuid from 'uuid/v4'

import { FILES_DOCTYPE, ROOT_DIR_ID, TRASH_DIR_ID, TRASH_DIR_NAME } from '../../../src/remote/constants'
import timestamp from '../../../src/timestamp'

import type { RemoteDoc } from '../../../src/remote/document'

const ROOT_DIR_PROPERTIES = {
  _id: ROOT_DIR_ID,
  path: '/'
}

const TRASH_DIR_PROPERTIES = {
  _id: TRASH_DIR_ID,
  path: `/${TRASH_DIR_NAME}`
}

export default class RemoteBaseBuilder {
  cozy: Cozy
  options: {
    contentType?: string,
    dir: {_id: string, path: string},
    name: string,
    lastModifiedDate: Date
  }

  constructor (cozy: Cozy) {
    this.cozy = cozy
    this.options = {
      dir: ROOT_DIR_PROPERTIES,
      name: '',
      lastModifiedDate: timestamp.current()
    }
  }

  inDir (dir: RemoteDoc): this {
    this.options.dir = dir
    return this
  }

  inRootDir (): this {
    this.options.dir = ROOT_DIR_PROPERTIES
    return this
  }

  trashed (): this {
    this.options.dir = TRASH_DIR_PROPERTIES
    return this
  }

  timestamp (...args: number[]): this {
    this.options.lastModifiedDate = timestamp.build(...args)
    return this
  }

  named (name: string): this {
    this.options.name = name
    return this
  }

  build (): Object {
    return {
      _id: uuid().replace(/-/g, ''),
      _rev: '1-' + uuid().replace(/-/g, ''),
      _type: FILES_DOCTYPE,
      created_at: this.options.lastModifiedDate,
      dir_id: this.options.dir._id,
      name: this.options.name,
      path: `${this.options.dir.path}/${this.options.name}`,
      tags: [],
      updated_at: this.options.lastModifiedDate
    }
  }
}
