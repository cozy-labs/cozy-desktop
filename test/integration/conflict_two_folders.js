/* eslint-env mocha */

import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Conflict between two folders', function () {
  this.slow(1000)
  this.timeout(10000)

  before(Cozy.ensurePreConditions)

  describe('with local first', function () {
    let folder = {
      path: '',
      name: faker.internet.domainWord()
    }
    let localChild = {
      path: path.join(folder.path, folder.name),
      name: `a${faker.name.firstName()}`,
      lastModification: '2015-12-09T12:11:30.861Z'
    }
    let remoteChild = {
      path: path.join(folder.path, folder.name),
      name: `z${faker.name.lastName()}`,
      lastModification: '2015-12-09T12:12:39.844Z'
    }

    before(Files.deleteAll)
    before(Cozy.registerDevice)

    before('Create the remote tree', done =>
      Files.createFolder(folder, function (_, created) {
        let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
        return Files.uploadFile(remoteChild, fixturePath, done)
      })
    )

    before('Create the local tree', function () {
      let folderPath = path.join(this.syncPath, folder.path, folder.name)
      fs.ensureDirSync(folderPath)
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      let filePath = path.join(this.syncPath, localChild.path, localChild.name)
      return fs.copySync(fixturePath, filePath)
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', done => setTimeout(done, 2000))

    it('has the two files on local', function () {
      let folders = fs.readdirSync(this.syncPath)
      folders = (Array.from(folders).filter((f) => f !== '.cozy-desktop').map((f) => f))
      folders.length.should.equal(1)
      let files = fs.readdirSync(path.join(this.syncPath, folders[0]))
      files.length.should.equal(2)
      let [local, remote] = files.sort()
      local.should.equal(localChild.name)
      remote.should.equal(remoteChild.name)
    })

    it('has the two files on remote', done =>
      Files.getAllFiles(function (_, files) {
        let local, remote
        files.length.should.equal(2)
        if (files[0].name === localChild.name) {
          [local, remote] = files
        } else {
          [remote, local] = files
        }
        local.path.should.equal(`/${localChild.path}`)
        local.name.should.equal(localChild.name)
        remote.path.should.equal(`/${remoteChild.path}`)
        remote.name.should.equal(remoteChild.name)
        done()
      })
    )
  })

  describe('with remote first', function () {
    let folder = {
      path: '',
      name: faker.internet.domainWord()
    }
    let localChild = {
      path: path.join(folder.path, folder.name),
      name: `b${faker.name.firstName()}`,
      lastModification: '2015-12-09T12:11:30.861Z'
    }
    let remoteChild = {
      path: path.join(folder.path, folder.name),
      name: `y${faker.name.lastName()}`,
      lastModification: '2015-12-09T12:12:39.844Z'
    }

    before(Files.deleteAll)
    before(Cozy.registerDevice)

    before('Create the remote tree', done =>
      Files.createFolder(folder, function (_, created) {
        let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
        return Files.uploadFile(remoteChild, fixturePath, done)
      })
    )

    before(Cozy.fetchRemoteMetadata)

    before('Create the local tree', function () {
      let folderPath = path.join(this.syncPath, folder.path, folder.name)
      fs.ensureDirSync(folderPath)
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      let filePath = path.join(this.syncPath, localChild.path, localChild.name)
      return fs.copySync(fixturePath, filePath)
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', done => setTimeout(done, 2000))

    it('has the two files on local', function () {
      let folders = fs.readdirSync(this.syncPath)
      folders = (Array.from(folders).filter((f) => f !== '.cozy-desktop').map((f) => f))
      folders.length.should.equal(1)
      let files = fs.readdirSync(path.join(this.syncPath, folders[0]))
      files.length.should.equal(2)
      let [local, remote] = files.sort()
      local.should.equal(localChild.name)
      remote.should.equal(remoteChild.name)
    })

    it('has the two files on remote', done =>
      Files.getAllFiles(function (_, files) {
        let local, remote
        files.length.should.equal(2)
        if (files[0].name === localChild.name) {
          [local, remote] = files
        } else {
          [remote, local] = files
        }
        local.path.should.equal(`/${localChild.path}`)
        local.name.should.equal(localChild.name)
        remote.path.should.equal(`/${remoteChild.path}`)
        remote.name.should.equal(remoteChild.name)
        done()
      })
    )
  })
})
