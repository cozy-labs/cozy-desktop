/* @flow */

const _ = require('lodash')

const { ROOT_DIR_ID } = require('../../../../core/remote/constants')
const { remoteJsonToRemoteDoc } = require('../../../../core/remote/document')
const metadata = require('../../../../core/metadata')

const dbBuilders = require('../db')

/*::
import type { Cozy } from 'cozy-client-js'
import type { FullRemoteFile, RemoteDir, CouchDBDeletion } from '../../../../core/remote/document'
*/

// Build a CouchDBDeletion representing a remote Cozy document that was
// completely deleted:
//
//     const doc: CouchDBDeletion = builders.remoteErased().build()
//
// To actually create and erased the corresponding document on the Cozy, use the
// async #create() method instead:
//
//     const doc: CouchDBDeletion = await builders.remoteErased().create()
//
module.exports = class RemoteErasedBuilder {
  /*::
  cozy: ?Cozy
  remoteDoc: ?(FullRemoteFile|RemoteDir)
  */

  constructor(cozy /*: ?Cozy */, old /*: ?(FullRemoteFile|RemoteDir) */) {
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

  build() /*: CouchDBDeletion */ {
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

  async create() /*: Promise<CouchDBDeletion> */ {
    const cozy = this._ensureCozy()

    if (this.remoteDoc) {
      const { _id, _rev } = this.remoteDoc
      await cozy.files.destroyById(_id)
      return {
        _id,
        // Build a fake revision as destroyById does not return the deleted doc
        _rev: dbBuilders.rev(metadata.extractRevNumber({ _rev }) + 1),
        _deleted: true
      }
    } else {
      const { _id, _rev } = _.clone(
        remoteJsonToRemoteDoc(
          await cozy.files.createDirectory({
            name: '',
            dirID: ROOT_DIR_ID,
            noSanitize: true
          })
        )
      )
      await cozy.files.destroyById(_id)
      return {
        _id,
        // Build a fake revision as destroyById does not return the deleted doc
        _rev: dbBuilders.rev(metadata.extractRevNumber({ _rev }) + 1),
        _deleted: true
      }
    }
  }
}
