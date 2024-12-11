const fse = require('fs-extra')
const sinon = require('sinon')

const { MissingFileError } = require('../../../core/utils/fs')

const createTrashMock = () => {
  const sendToTrash = sinon.stub()

  const reset = () => {
    sendToTrash.callsFake(async fullpath => {
      const docExists = await fse.exists(fullpath)
      if (!docExists) {
        throw new MissingFileError(fullpath)
      }

      await fse.remove(fullpath)
    })
  }

  const withFailingTrash = () => {
    sendToTrash.callsFake(async fullpath => {
      throw new Error(`Could not trash ${fullpath}`)
    })
  }

  reset()

  return {
    reset,
    sendToTrash,
    withFailingTrash
  }
}

module.exports = {
  createTrashMock
}
