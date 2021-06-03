/* @flow */

const _ = require('lodash')

const RemoteBaseBuilder = require('./base')
const { remoteJsonToRemoteDoc } = require('../../../../core/remote/document')

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

  async create() /*: Promise<MetadataRemoteDir> */ {
    const cozy = this._ensureCozy()

    return _.clone(
      remoteJsonToRemoteDoc(
        await cozy.files.createDirectory({
          name: this.remoteDoc.name,
          dirID: this.remoteDoc.dir_id,
          createdAt: this.remoteDoc.created_at,
          updatedAt: this.remoteDoc.updated_at,
          noSanitize: true
        })
      )
    )
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

    return _.clone(remoteJsonToRemoteDoc(json))
  }
}
