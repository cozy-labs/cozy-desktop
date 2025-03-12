/* @flow */

const _ = require('lodash')

const metadata = require('../../../../core/metadata')
const {
  FILES_DOCTYPE,
  ROOT_DIR_ID
} = require('../../../../core/remote/constants')
const { jsonApiToRemoteDoc } = require('../../../../core/remote/document')
const cozyHelpers = require('../../helpers/cozy')
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
    const client = await cozyHelpers.newClient(this._ensureCozy())

    if (!this.remoteDoc) {
      const { data: directory } = await client
        .collection(FILES_DOCTYPE)
        .createDirectory(
          {
            name: '',
            dirId: ROOT_DIR_ID
          },
          {
            sanitizeName: false
          }
        )

      this.remoteDoc = jsonApiToRemoteDoc(directory)
    }

    const {
      data: { _id, _rev, _deleted }
    } = await client.collection(FILES_DOCTYPE).destroy(this.remoteDoc)

    return { _id, _rev, _deleted }
  }
}
