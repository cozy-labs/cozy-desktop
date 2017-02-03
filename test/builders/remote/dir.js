import RemoteBaseBuilder from './base'

// Used to generate readable unique dirnames
var dirNumber = 1

// Create a remote directory for testing purpose
//
//     let dir = builders.dir().build()
//
export default class RemoteDirBuilder extends RemoteBaseBuilder {
  constructor (cozy) {
    super(cozy)

    Object.assign(this.options, {
      name: `directory-${dirNumber++}`
    })
  }

  async build () {
    return this.toRemoteMetadata(
      await this.cozy.files.createDirectory(this.options)
    )
  }
}
