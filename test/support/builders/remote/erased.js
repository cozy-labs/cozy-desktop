/* @flow */

const _ = require('lodash')

const { ROOT_DIR_ID } = require('../../../../core/remote/constants')
const { jsonApiToRemoteDoc } = require('../../../../core/remote/document')
const metadata = require('../../../../core/metadata')

const dbBuilders = require('../db')

/*::
import type { Cozy } from 'cozy-client-js'
import type { RemoteFile, RemoteDir, RemoteDeletion } from '../../../../core/remote/document'
import type { MetadataRemoteFile, MetadataRemoteDir } from '../../../../core/metadata'
*/

// Build a RemoteDeletion representing a remote Cozy document that was
// completely deleted:
//
//     const doc: RemoteDeletion = builders.remoteErased().build()
//
// To actually create and erased the corresponding document on the Cozy, use the
// async #create() method instead:
//
//     const doc: RemoteDeletion = await builders.remoteErased().create()
//
module.exports = class RemoteDirBuilder {
  /*::
  cozy: ?Cozy
  remoteDoc: ?RemoteFile|MetadataRemoteFile|RemoteDir|MetadataRemoteDir
  */

  constructor(
    cozy /*: ?Cozy */,
    old /*: ?(RemoteFile|MetadataRemoteFile|RemoteDir|MetadataRemoteDir) */
  ) {
    this.cozy = cozy
    if (old) {
      this.remoteDoc = {
        ..._.cloneDeep(old),
        _rev: dbBuilders.rev(metadata.extractRevNumber(old) + 1)
      }
    }
  }

  _ensureCozy() /*: Cozy */ {
    if (this.cozy) {
      return this.cozy
    } else {
      throw new Error('Cannot create remote files/dirs without a Cozy client.')
    }
  }

  build() /*: RemoteDeletion */ {
    if (this.remoteDoc) {
      return {
        _id: this.remoteDoc._id,
        _rev: this.remoteDoc._rev,
        _deleted: true
      }
    } else {
      return {
        _id: dbBuilders.id(),
        _rev: dbBuilders.rev(2),
        _deleted: true
      }
    }
  }

  async create() /*: Promise<RemoteDeletion> */ {
    const cozy = this._ensureCozy()

    if (this.remoteDoc) {
      const json = await cozy.files.destroyById(this.remoteDoc._id)
      return _.clone(jsonApiToRemoteDoc(json))
    } else {
      const remoteDir = _.clone(
        jsonApiToRemoteDoc(
          await cozy.files.createDirectory({
            name: '',
            dirID: ROOT_DIR_ID,
            noSanitize: true
          })
        )
      )
      const json = await cozy.files.destroyById(remoteDir._id)
      return _.clone(jsonApiToRemoteDoc(json))
    }
  }
}
