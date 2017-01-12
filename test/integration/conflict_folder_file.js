/* eslint-env mocha */

import faker from 'faker'
import find from 'lodash.find'
import fs from 'fs-extra'
import path from 'path'
import should from 'should'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Conflict', function () {
  this.slow(1000)
  this.timeout(10000)

  before(Cozy.ensurePreConditions)

  describe('between a local file and a remote folder', function () {
    return it.skip('https://github.com/cozy/cozy-files/issues/386')

    /* eslint-disable no-unreachable */
    let file = {
      path: '',
      name: faker.commerce.color(),
      lastModification: '2015-10-10T01:02:03Z'
    }
    let folder = {
      path: file.path,
      name: file.name
    }
    let child = {
      path: path.join(folder.path, folder.name),
      name: faker.commerce.product(),
      lastModification: '2015-10-11T01:02:03Z'
    }

    before(Cozy.registerDevice)
    before(Files.deleteAll)

    before('Create the remote tree', done =>
      Files.createFolder(folder, function (_, created) {
        let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
        return Files.uploadFile(child, fixturePath, done)
      })
    )

    before('Create the local tree', function () {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      let filePath = path.join(this.syncPath, file.path, file.name)
      return fs.copySync(fixturePath, filePath)
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', done => setTimeout(done, 3000))

    it('has the file and the folder on local', function () {
      let paths = fs.readdirSync(this.syncPath)
      paths = (Array.from(paths).filter((f) => f !== '.cozy-desktop').map((f) => f))
      paths.length.should.equal(2)
      let [f1, f2] = paths.sort()
      fs.statSync(path.join(this.syncPath, f1)).isFile()
      fs.statSync(path.join(this.syncPath, f2)).isDirectory()
      f1.should.equal(file.name)
      let parts = f2.split('-conflict-')
      parts.length.should.equal(2)
      parts[0].should.equal(folder.name)
      let children = fs.readdirSync(path.join(this.syncPath, f2))
      children.length.should.equal(1)
      children[0].should.equal(child.name)
    })

    it('has the file and the folder on remote', done =>
      Files.getAllFiles(function (_, files) {
        files.length.should.equal(2)
        done()
      })
    )
    /* eslint-enable no-unreachable */
  })

  describe('between a local folder and a remote file', function () {
    let file = {
      path: '',
      name: faker.commerce.department(),
      lastModification: '2015-10-08T01:02:03Z'
    }
    let folder = {
      path: file.path,
      name: file.name
    }
    let child = {
      path: path.join(folder.path, folder.name),
      name: faker.commerce.productMaterial(),
      lastModification: '2015-10-09T01:02:03Z'
    }

    before(Cozy.registerDevice)
    before(Files.deleteAll)

    before('Create the remote tree', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
      return Files.uploadFile(file, fixturePath, done)
    })

    before('Create the local tree', function () {
      let folderPath = path.join(this.syncPath, folder.path, folder.name)
      fs.ensureDirSync(folderPath)
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      let childPath = path.join(this.syncPath, child.path, child.name)
      return fs.copySync(fixturePath, childPath)
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', done => setTimeout(done, 3000))

    it('has the file and the folder on local', function () {
      let paths = fs.readdirSync(this.syncPath)
      paths = (Array.from(paths).filter((f) => f !== '.cozy-desktop').map((f) => f))
      paths.length.should.equal(2)
      let [f1, f2] = paths.sort()
      fs.statSync(path.join(this.syncPath, f1)).isDirectory()
      fs.statSync(path.join(this.syncPath, f2)).isFile()
      f1.should.equal(folder.name)
      let parts = f2.split('-conflict-')
      parts.length.should.equal(2)
      parts[0].should.equal(folder.name)
      let children = fs.readdirSync(path.join(this.syncPath, f1))
      children.length.should.equal(1)
      children[0].should.equal(child.name)
    })

    it('has the file and the folder on remote', done =>
      Files.getAllFiles(function (_, files) {
        files.length.should.equal(2)
        if (files[0].path === file.path) { files = files.reverse() }
        files[0].path.should.equal(`/${child.path}`)
        files[0].name.should.equal(child.name)
        files[1].path.should.equal(file.path)
        let parts = files[1].name.split('-conflict-')
        parts.length.should.equal(2)
        parts[0].should.equal(file.name)
        return Files.getAllFolders(function (_, folders) {
          folders.length.should.equal(1)
          should.exist(find(folders, folder))
          done()
        })
      })
    )
  })
})
