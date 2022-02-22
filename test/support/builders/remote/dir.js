/* @flow */

const _ = require('lodash')
const CozyClient = require('cozy-client').default

const RemoteBaseBuilder = require('./base')
const { remoteJsonToRemoteDoc } = require('../../../../core/remote/document')
const {
  FILES_DOCTYPE,
  OAUTH_CLIENTS_DOCTYPE
} = require('../../../../core/remote/constants')

/*::
import type { Cozy } from 'cozy-client-js'
import type { RemoteDir } from '../../../../core/remote/document'
import type { MetadataRemoteDir } from '../../../../core/metadata'
*/

// Used to generate readable unique dirnames
var dirNumber = 1

// Build a MetadataRemoteDir representing a remote Cozy directory:
//
//     const dir: MetadataRemoteDir = builders.remoteDir().inDir(...).build()
//
// To actually create the corresponding directory on the Cozy, use the async
// #create() method instead:
//
//     const dir: MetadataRemoteDir = await builders.remoteDir().inDir(...).create()
//
module.exports = class RemoteDirBuilder extends RemoteBaseBuilder /*:: <MetadataRemoteDir> */ {
  constructor(cozy /*: ?Cozy */, old /*: ?(RemoteDir|MetadataRemoteDir) */) {
    super(cozy, old)

    if (!old) {
      this.name(`directory-${dirNumber++}`)
    }
    this.remoteDoc.type = 'directory'
  }

  excludedFrom(clientIds /*: string[] */) /*: this */ {
    this.remoteDoc.not_synchronized_on = clientIds.map(id => ({
      type: OAUTH_CLIENTS_DOCTYPE,
      id
    }))
    return this
  }

  async newClient(cozy /*: Cozy */) /*: Promise<CozyClient> */ {
    let client /*: CozyClient */
    return (async (cozy /*: Cozy */) /*: Promise<CozyClient> */ => {
      if (!client) {
        if (cozy._oauth) {
          // Make sure we have an authorized client to build a new client from.
          await cozy.authorize()
          client = await CozyClient.fromOldOAuthClient(cozy)
        } else {
          client = await CozyClient.fromOldClient(cozy)
        }
      }
      return client
    })(cozy)
  }

  async create() /*: Promise<MetadataRemoteDir> */ {
    const cozy = this._ensureCozy()

    const json = await cozy.files.createDirectory({
      name: this.remoteDoc.name,
      dirID: this.remoteDoc.dir_id,
      createdAt: this.remoteDoc.created_at,
      updatedAt: this.remoteDoc.updated_at,
      noSanitize: true
    })

    if (
      this.remoteDoc.not_synchronized_on &&
      this.remoteDoc.not_synchronized_on.length
    ) {
      for (const { id, type } of this.remoteDoc.not_synchronized_on) {
        const client = await this.newClient(cozy)
        const files = client.collection(FILES_DOCTYPE)
        await files.addNotSynchronizedDirectories({ _id: id, _type: type }, [
          json
        ])
      }

      const excluded = await cozy.files.statById(json._id)
      return _.clone(remoteJsonToRemoteDoc(excluded))
    }

    return _.clone(remoteJsonToRemoteDoc(json))
  }

  async update() /*: Promise<MetadataRemoteDir> */ {
    const cozy = this._ensureCozy()

    const json = this.remoteDoc.trashed
      ? await cozy.files.trashById(this.remoteDoc._id, { dontRetry: true })
      : await cozy.files.updateAttributesById(this.remoteDoc._id, {
          dir_id: this.remoteDoc.dir_id,
          name: this.remoteDoc.name,
          updated_at: this.remoteDoc.updated_at,
          noSanitize: true
        })

    if (
      _.difference(
        this.remoteDoc.not_synchronized_on,
        json.attributes.not_synchronized_on || []
      ).length
    ) {
      for (const { id, type } of json.attributes.not_synchronized_on || []) {
        const client = await this.newClient(cozy)
        const files = client.collection(FILES_DOCTYPE)
        await files.removeNotSynchronizedDirectories({ _id: id, _type: type }, [
          json
        ])
      }

      for (const { id, type } of this.remoteDoc.not_synchronized_on || []) {
        const client = await this.newClient(cozy)
        const files = client.collection(FILES_DOCTYPE)
        await files.addNotSynchronizedDirectories({ _id: id, _type: type }, [
          json
        ])
      }

      const excluded = await cozy.files.statById(json._id)
      return _.clone(remoteJsonToRemoteDoc(excluded))
    }

    return _.clone(remoteJsonToRemoteDoc(json))
  }
}
