/* @flow */

const _ = require('lodash')

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
//     const dir: RemoteDoc = builders.remote.dir().inDir(...).build()
//
// To actually create the corresponding directory on the Cozy, use the async
// #create() method instead:
//
//     const dir: RemoteDoc = await builders.remote.dir().inDir(...).create()
//
module.exports = class RemoteDirBuilder extends RemoteBaseBuilder {
  constructor (cozy /*: Cozy */) {
    super(cozy)

    Object.assign(this.options, {
      name: `directory-${dirNumber++}`
    })
  }

  build () /*: RemoteDoc */ {
    return _.merge({type: 'directory'}, super.build())
  }

  async create () /*: Promise<RemoteDoc> */ {
    return jsonApiToRemoteDoc(
      await this.cozy.files.createDirectory({
        name: this.options.name,
        dirID: this.options.dir._id,
        lastModifiedDate: this.options.lastModifiedDate
      })
    )
  }
}
