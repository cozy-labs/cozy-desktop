/* @flow */
/* eslint-env mocha */

const childProcess = require('child_process')
const path = require('path')

const Promise = require('bluebird')
const fse = require('fs-extra')
const should = require('should')

const { hideOnWindows, sendToTrash } = require('../../../core/utils/fs')
const configHelpers = require('../../support/helpers/config')

Promise.promisifyAll(childProcess)

describe('utils/fs', () => {
  before('instanciate config', configHelpers.createConfig)
  after('clean config directory', configHelpers.cleanConfig)

  describe('hideOnWindows', () => {
    const { platform } = process
    const dirName = '.dir-to-hide'
    let parentPath, dirPath, missingPath

    before(async function() {
      parentPath = this.syncPath
      dirPath = path.join(parentPath, dirName)
      missingPath = path.join(parentPath, 'missing')

      await fse.ensureDir(dirPath)
    })

    if (platform === 'win32') {
      it('sets the hidden attribute of the given dir on Windows', async () => {
        await should(hideOnWindows(dirPath)).be.fulfilled()
        // $FlowFixMe
        const output = await childProcess.execAsync(`dir "${parentPath}"`, {
          encoding: 'utf8'
        })
        should(output).not.match(dirName)
      })
    } else {
      it(`does nothing on ${platform}`, () =>
        should(hideOnWindows(dirPath)).be.fulfilled())
    }

    it('never throws any error', async () =>
      should(hideOnWindows(missingPath)).be.fulfilled())
  })

  describe('sendToTrash', () => {
    it('removes the given file from the sync directory', async function() {
      const fullpath = p => path.join(this.syncPath, p)
      await fse.ensureDir(fullpath('dir'))
      await fse.ensureFile(fullpath('dir/file'))

      await should(sendToTrash(fullpath('dir/file'))).be.fulfilled()
      await should(fse.exists(fullpath('dir'))).be.fulfilledWith(true)
      await should(fse.exists(fullpath('dir/file'))).be.fulfilledWith(false)
    })

    it('removes the given directory and its content from the sync directory', async function() {
      const fullpath = p => path.join(this.syncPath, p)
      await fse.ensureDir(fullpath('dir'))
      await fse.ensureFile(fullpath('dir/file'))

      await should(sendToTrash(fullpath('dir'))).be.fulfilled()
      await should(fse.exists(fullpath('dir'))).be.fulfilledWith(false)
      await should(fse.exists(fullpath('dir/file'))).be.fulfilledWith(false)
    })

    it('throws an error with code ENOENT when the document is missing', async function() {
      const fullpath = p => path.join(this.syncPath, p)
      try {
        await fse.remove(fullpath('doc'))
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }

      await should(sendToTrash(fullpath('doc'))).be.rejectedWith({
        code: 'ENOENT'
      })
    })
  })
})
