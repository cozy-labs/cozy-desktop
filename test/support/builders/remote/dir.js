/* @flow */

const _ = require('lodash')

const RemoteBaseBuilder = require('./base')
const {
  DIR_TYPE,
  FILES_DOCTYPE,
  OAUTH_CLIENTS_DOCTYPE
} = require('../../../../core/remote/constants')
const {
  inRemoteTrash,
  jsonApiToRemoteDoc
} = require('../../../../core/remote/document')
const cozyHelpers = require('../../helpers/cozy')

/*::
import type { Cozy } from 'cozy-client-js'
import type { RemoteDir } from '../../../../core/remote/document'
*/

// Used to generate readable unique dirnames
var dirNumber = 1

// Build a RemoteDir representing a remote Cozy directory:
//
//     const dir: RemoteDir = builders.remoteDir().inDir(...).build()
//
// To actually create the corresponding directory on the Cozy, use the async
// #create() method instead:
//
//     const dir: RemoteDir = await builders.remoteDir().inDir(...).create()
//
module.exports = class RemoteDirBuilder extends RemoteBaseBuilder /*:: <RemoteDir> */ {
  constructor(cozy /*: ?Cozy */, old /*: ?RemoteDir */) {
    super(cozy, old)

    if (!old) {
      this.name(`directory-${dirNumber++}`)
    }
    this.remoteDoc.type = DIR_TYPE
  }

  excludedFrom(clientIds /*: string[] */) /*: this */ {
    this.remoteDoc.not_synchronized_on = clientIds.map(id => ({
      type: OAUTH_CLIENTS_DOCTYPE,
      id
    }))
    return this
  }

  async create() /*: Promise<RemoteDir> */ {
    const cozy = this._ensureCozy()
    const client = await cozyHelpers.newClient(cozy)
    const files = client.collection(FILES_DOCTYPE)

    const { data: directory } = await files.createDirectory(
      {
        name: this.remoteDoc.name,
        dirId: this.remoteDoc.dir_id,
        lastModifiedDate: this.remoteDoc.updated_at || this.remoteDoc.created_at
      },
      { sanitizeName: false }
    )

    if (
      this.remoteDoc.not_synchronized_on &&
      this.remoteDoc.not_synchronized_on.length
    ) {
      for (const { id, type } of this.remoteDoc.not_synchronized_on) {
        await files.addNotSynchronizedDirectories({ _id: id, _type: type }, [
          directory
        ])
      }

      const { data: excluded } = await files.statById(directory._id)
      return jsonApiToRemoteDoc(excluded)
    }

    return jsonApiToRemoteDoc(directory)
  }

  async update() /*: Promise<RemoteDir> */ {
    const cozy = this._ensureCozy()
    const client = await cozyHelpers.newClient(cozy)
    const files = client.collection(FILES_DOCTYPE)

    const { data: directory } = inRemoteTrash(this.remoteDoc)
      ? await client.collection(FILES_DOCTYPE).destroy(this.remoteDoc)
      : await client.collection(FILES_DOCTYPE).updateAttributesById(
          this.remoteDoc._id,
          {
            dir_id: this.remoteDoc.dir_id,
            name: this.remoteDoc.name,
            updated_at: this.remoteDoc.updated_at
          },
          { sanitizeName: false }
        )

    if (
      _.difference(
        this.remoteDoc.not_synchronized_on,
        directory.attributes.not_synchronized_on || []
      ).length
    ) {
      for (const { id, type } of directory.attributes.not_synchronized_on ||
        []) {
        await files.removeNotSynchronizedDirectories({ _id: id, _type: type }, [
          directory
        ])
      }

      for (const { id, type } of this.remoteDoc.not_synchronized_on || []) {
        await files.addNotSynchronizedDirectories({ _id: id, _type: type }, [
          directory
        ])
      }

      const { data: excluded } = await files.statById(directory._id)
      return jsonApiToRemoteDoc(excluded)
    }

    return jsonApiToRemoteDoc(directory)
  }
}
