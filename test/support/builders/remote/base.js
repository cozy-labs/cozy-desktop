/* @flow */

const path = require('path')
const uuid = require('uuid/v4')

const { FILES_DOCTYPE, ROOT_DIR_ID, TRASH_DIR_ID, TRASH_DIR_NAME } = require('../../../../core/remote/constants')
const timestamp = require('../../../../core/timestamp')

/*::
import type { Cozy } from 'cozy-client-js'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

const ROOT_DIR_PROPERTIES = {
  _id: ROOT_DIR_ID,
  path: '/'
}

const TRASH_DIR_PROPERTIES = {
  _id: TRASH_DIR_ID,
  path: `/${TRASH_DIR_NAME}`
}

module.exports = class RemoteBaseBuilder {
  /*::
  cozy: Cozy
  options: {
    contentType?: string,
    dir: {_id: string, path: string},
    name: string,
    executable?: bool,
    lastModifiedDate: Date
  }
  */

  constructor (cozy /*: Cozy */) {
    this.cozy = cozy
    this.options = {
      dir: ROOT_DIR_PROPERTIES,
      name: '',
      lastModifiedDate: timestamp.current()
    }
  }

  inDir (dir /*: RemoteDoc */) /*: this */ {
    this.options.dir = dir
    return this
  }

  inRootDir () /*: this */ {
    this.options.dir = ROOT_DIR_PROPERTIES
    return this
  }

  trashed () /*: this */ {
    this.options.dir = TRASH_DIR_PROPERTIES
    return this
  }

  timestamp (...args /*: number[] */) /*: this */ {
    this.options.lastModifiedDate = timestamp.build(...args)
    return this
  }

  named (name /*: string */) /*: this */ {
    this.options.name = name
    return this
  }

  build () /*: Object */ {
    return {
      _id: uuid().replace(/-/g, ''),
      _rev: '1-' + uuid().replace(/-/g, ''),
      _type: FILES_DOCTYPE,
      created_at: this.options.lastModifiedDate,
      dir_id: this.options.dir._id,
      name: this.options.name,
      path: path.posix.join(this.options.dir.path, this.options.name),
      tags: [],
      updated_at: this.options.lastModifiedDate
    }
  }
}
