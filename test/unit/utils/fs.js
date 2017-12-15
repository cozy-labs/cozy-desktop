/* @flow */
/* eslint-env mocha */

import Promise from 'bluebird'
import childProcess from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import should from 'should'

import { hideOnWindows } from '../../../core/utils/fs'

import configHelpers from '../../helpers/config'

Promise.promisifyAll(childProcess)
Promise.promisifyAll(fs)

describe('utils/fs', () => {
  before('instanciate config', configHelpers.createConfig)
  after('clean config directory', configHelpers.cleanConfig)

  describe('hideOnWindows', () => {
    const { platform } = process
    const dirName = '.dir-to-hide'
    let parentPath, dirPath, missingPath

    before(async function () {
      parentPath = this.syncPath
      dirPath = path.join(parentPath, dirName)
      missingPath = path.join(parentPath, 'missing')

      await fs.ensureDirAsync(dirPath)
    })

    if (platform === 'win32') {
      it('sets the hidden attribute of the given dir on Windows', async () => {
        await should(hideOnWindows(dirPath)).be.fulfilled()
        // $FlowFixMe
        const output = await childProcess.execAsync(`dir ${parentPath}`, {encoding: 'utf8'})
        should(output).not.match(dirName)
      })
    } else {
      it(`does nothing on ${platform}`, () =>
        should(hideOnWindows(dirPath)).be.fulfilled()
      )
    }

    it('never throws any error', async () =>
      should(hideOnWindows(missingPath)).be.fulfilled()
    )
  })
})
