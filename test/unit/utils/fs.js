/* @flow */
/* eslint-env mocha */

const Promise = require('bluebird')
const childProcess = require('child_process')
const fse = require('fs-extra')
const path = require('path')
const should = require('should')

const { hideOnWindows } = require('../../../core/utils/fs')

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
})
