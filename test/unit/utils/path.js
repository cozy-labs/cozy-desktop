/* @flow */
/* eslint-env mocha */

const path = require('path')
const should = require('should')

const { localToRemote, remoteToLocal } = require('../../../core/utils/path')

describe('utils/path', () => {
  describe('localToRemote', () => {
    it('converts local paths into their remote equivalent', () => {
      // We use path.normalize to get local paths on all platforms
      const localRootPath = path.normalize('')
      const localDirPath = path.normalize('dir')
      const localFilePath = path.normalize('dir/subdir/file')

      should(localToRemote(localRootPath)).equal('/')
      should(localToRemote(localDirPath)).equal('/dir')
      should(localToRemote(localFilePath)).equal('/dir/subdir/file')
    })

    it('keeps remote paths untouched', () => {
      const remoteRootPath = '/'
      const remoteDirPath = '/dir'
      const remoteFilePath = '/dir/subdir/file'

      should(localToRemote(remoteRootPath)).equal(remoteRootPath)
      should(localToRemote(remoteDirPath)).equal(remoteDirPath)
      should(localToRemote(remoteFilePath)).equal(remoteFilePath)
    })
  })

  describe('remoteToLocal', () => {
    it('converts remote paths into their local equivalent', () => {
      const remoteRootPath = '/'
      const remoteDirPath = '/dir'
      const remoteFilePath = '/dir/subdir/file'

      // We use path.normalize to get local paths on all platforms
      should(remoteToLocal(remoteRootPath)).equal(path.normalize(''))
      should(remoteToLocal(remoteDirPath)).equal(path.normalize('dir'))
      should(remoteToLocal(remoteFilePath)).equal(
        path.normalize('dir/subdir/file')
      )
    })

    it('keeps local paths untouched', () => {
      // We use path.normalize to get local paths on all platforms
      const localRootPath = path.normalize('')
      const localDirPath = path.normalize('dir')
      const localFilePath = path.normalize('dir/subdir/file')

      should(remoteToLocal(localRootPath)).equal(localRootPath)
      should(remoteToLocal(localDirPath)).equal(localDirPath)
      should(remoteToLocal(localFilePath)).equal(localFilePath)
    })
  })
})
