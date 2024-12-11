/* @flow */

const { posix } = require('path')

const _ = require('lodash')

const metadata = require('../../../../core/metadata')
const {
  DIR_TYPE,
  FILES_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  TRASH_DIR_NAME
} = require('../../../../core/remote/constants')
const timestamp = require('../../../../core/utils/timestamp')
const dbBuilders = require('../db')

/*::
import type { Cozy } from 'cozy-client-js'
import type { FullRemoteFile, RemoteDir, RemoteDoc } from '../../../../core/remote/document'

type Ref = { _id: string, _type: string }
*/

module.exports = class RemoteBaseBuilder /*:: <T: FullRemoteFile|RemoteDir> */ {
  /*::
  cozy: ?Cozy
  remoteDoc: T & { referenced_by: Ref[] }
  */

  constructor(cozy /*: ?Cozy */, old /*: ?T */) {
    this.cozy = cozy
    if (old) {
      this.remoteDoc = _.cloneDeep(old)
      this.shortRev(metadata.extractRevNumber(old) + 1)
    } else {
      const name = 'whatever'
      // $FlowFixMe dates are added in build
      this.remoteDoc = {
        _id: dbBuilders.id(),
        _rev: dbBuilders.rev(1),
        _type: FILES_DOCTYPE,
        type: DIR_TYPE,
        dir_id: ROOT_DIR_ID,
        name,
        path: posix.join(posix.sep, name),
        tags: [],
        cozyMetadata: {}
      }
    }
  }

  inDir(dir /*: {_id: string, path: string} */) /*: this */ {
    this.remoteDoc.dir_id = dir._id
    this.remoteDoc.path = posix.join(
      posix.normalize(dir.path),
      this.remoteDoc.name
    )
    return this
  }

  inRootDir() /*: this */ {
    return this.inDir({
      _id: ROOT_DIR_ID,
      path: '/'
    })
  }

  trashed() /*: this */ {
    this.remoteDoc.restore_path = posix.dirname(this.remoteDoc.path)
    return this.inDir({
      _id: TRASH_DIR_ID,
      path: `/${TRASH_DIR_NAME}`
    })
  }

  restored() /*: this */ {
    if (this.remoteDoc.restore_path) delete this.remoteDoc.restore_path
    return this.inRootDir()
  }

  tags(...tags /*: string[] */) /*: this */ {
    this.remoteDoc.tags = tags
    return this
  }

  noTags() /*: this */ {
    delete this.remoteDoc.tags
    return this
  }

  shortRev(revNumber /*: number */) /*: this */ {
    this.remoteDoc._rev = dbBuilders.rev(revNumber)
    return this
  }

  createdAt(...args /*: number[] */) /*: this */ {
    this.remoteDoc.created_at = timestamp.build(...args).toISOString()
    return this
  }

  updatedAt(...args /*: number[] */) /*: this */ {
    this.remoteDoc.updated_at = timestamp.build(...args).toISOString()
    return this
  }

  name(name /*: string */) /*: this */ {
    this.remoteDoc.name = name
    this.remoteDoc.path = posix.join(posix.dirname(this.remoteDoc.path), name)
    return this
  }

  referencedBy(refs /*: Ref[] */) /*: this */ {
    this.remoteDoc.referenced_by = refs
    return this
  }

  build() /*: T */ {
    const now = new Date().toISOString()
    if (!this.remoteDoc.created_at) this.remoteDoc.created_at = now
    if (!this.remoteDoc.updated_at) this.remoteDoc.updated_at = now

    return _.clone(this.remoteDoc)
  }

  _ensureCozy() /*: Cozy */ {
    if (this.cozy) {
      return this.cozy
    } else {
      throw new Error('Cannot create remote files/dirs without a Cozy client.')
    }
  }
}
