/* @flow */

const _ = require('lodash')
const { posix } = require('path')
const uuid = require('uuid/v4')

const {
  FILES_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  TRASH_DIR_NAME
} = require('../../../../core/remote/constants')
const timestamp = require('../../../../core/timestamp')

/*::
import type { Cozy } from 'cozy-client-js'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

const defaultTimestamp = timestamp.stringify(timestamp.current())

module.exports = class RemoteBaseBuilder {
  /*::
  cozy: Cozy
  doc: RemoteDoc
  */

  constructor (cozy /*: Cozy */) {
    this.cozy = cozy
    const name = 'whatever'
    this.doc = {
      _id: uuid().replace(/-/g, ''),
      _rev: '1-' + uuid().replace(/-/g, ''),
      _type: FILES_DOCTYPE,
      type: 'directory',
      created_at: defaultTimestamp,
      dir_id: ROOT_DIR_ID,
      name,
      path: posix.join(posix.sep, name),
      tags: [],
      updated_at: defaultTimestamp
    }
  }

  inDir (dir /*: RemoteDoc | {_id: string, path: string} */) /*: this */ {
    this.doc.dir_id = dir._id
    this.doc.path = posix.join(dir.path, this.doc.name)
    return this
  }

  inRootDir () /*: this */ {
    return this.inDir({
      _id: ROOT_DIR_ID,
      path: '/'
    })
  }

  trashed () /*: this */ {
    return this.inDir({
      _id: TRASH_DIR_ID,
      path: `/${TRASH_DIR_NAME}`
    })
  }

  timestamp (...args /*: number[] */) /*: this */ {
    this.doc.updated_at = timestamp.stringify(timestamp.build(...args))
    return this
  }

  named (name /*: string */) /*: this */ {
    this.doc.name = name
    this.doc.path = posix.join(posix.dirname(this.doc.path), name)
    return this
  }

  build () /*: Object */ {
    return _.clone(this.doc)
  }
}
