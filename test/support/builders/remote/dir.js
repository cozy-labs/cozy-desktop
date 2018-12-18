/* @flow */

const RemoteBaseBuilder = require('./base')
const { jsonApiToRemoteDoc } = require('../../../../core/remote/document')

/*::
import type { Cozy } from 'cozy-client-js'
import type { RemoteDoc } from '../../../../core/remote/document'
*/

// Used to generate readable unique dirnames
var dirNumber = 1

// Build a RemoteDoc representing a remote Cozy directory:
//
//     const dir: RemoteDoc = builders.remoteDir().inDir(...).build()
//
// To actually create the corresponding directory on the Cozy, use the async
// #create() method instead:
//
//     const dir: RemoteDoc = await builders.remoteDir().inDir(...).create()
//
module.exports = class RemoteDirBuilder extends RemoteBaseBuilder {
  constructor (cozy /*: Cozy */) {
    super(cozy)
    this.remoteDoc.type = 'directory'
    this.name(`directory-${dirNumber++}`)
  }

  async create () /*: Promise<RemoteDoc> */ {
    const cozy = this._ensureCozy()
    return jsonApiToRemoteDoc(
      await cozy.files.createDirectory({
        name: this.remoteDoc.name,
        dirID: this.remoteDoc.dir_id,
        lastModifiedDate: this.remoteDoc.updated_at
      })
    )
  }
}
