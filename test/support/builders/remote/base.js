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

const dbBuilders = require('../db')

/*::
import type { Cozy } from 'cozy-client-js'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

const defaultTimestamp = timestamp.stringify(timestamp.current())

module.exports = class RemoteBaseBuilder {
  /*::
  cozy: ?Cozy
  remoteDoc: RemoteDoc
  */

  constructor (cozy /*: ?Cozy */, old /*: ?RemoteDoc */) {
    this.cozy = cozy
    if (old) {
      this.remoteDoc = _.cloneDeep(old)
    } else {
      const name = 'whatever'
      this.remoteDoc = {
        _id: dbBuilders.id(),
        _rev: dbBuilders.rev(1),
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
  }

  inDir (dir /*: RemoteDoc | {_id: string, path: string} */) /*: this */ {
    this.remoteDoc.dir_id = dir._id
    this.remoteDoc.path = posix.join(dir.path, this.remoteDoc.name)
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

  restored () /*: this */ {
    return this.inRootDir()
  }

  shortRev (revNumber /*: number */) /*: this */ {
    this.remoteDoc._rev = revNumber.toString() + '-' + uuid().replace(/-/g, '')
    return this
  }

  timestamp (...args /*: number[] */) /*: this */ {
    this.remoteDoc.updated_at = timestamp.stringify(timestamp.build(...args))
    return this
  }

  name (name /*: string */) /*: this */ {
    this.remoteDoc.name = name
    this.remoteDoc.path = posix.join(posix.dirname(this.remoteDoc.path), name)
    return this
  }

  build () /*: Object */ {
    return _.clone(this.remoteDoc)
  }

  _ensureCozy () /*: Cozy */ {
    if (this.cozy) {
      return this.cozy
    } else {
      throw new Error('Cannot create remote files/dirs without a Cozy client.')
    }
  }
}
