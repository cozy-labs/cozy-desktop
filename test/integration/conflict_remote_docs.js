/* eslint-env mocha */

import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Conflict between remote docs with distinct cases', function () {
  this.slow(1000)
  this.timeout(10000)

  before(Cozy.ensurePreConditions)

  describe('2 files', function () {
    let lower = {
      path: '',
      name: faker.commerce.color().toLowerCase(),
      lastModification: '2015-10-12T01:02:03Z'
    }
    let upper = {
      path: lower.path,
      name: lower.name.toUpperCase(),
      lastModification: '2015-11-13T02:03:05Z'
    }
    let expectedSizes = []

    before(Files.deleteAll)
    before(Cozy.registerDevice)

    before('force case insensitive for local', function () {
      this.app.instanciate()
      this.app.prep.buildId = this.app.prep.buildIdHFS
    })

    before('Create the lower file', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
      return Files.uploadFile(lower, fixturePath, function (_, created) {
        lower.remote = {
          id: created.id,
          size: fs.statSync(fixturePath).size
        }
        done()
      })
    })

    before(Cozy.fetchRemoteMetadata)

    before('Create the upper file', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      return Files.uploadFile(upper, fixturePath, function (_, created) {
        upper.remote = {
          id: created.id,
          size: fs.statSync(fixturePath).size
        }
        done()
      })
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', function (done) {
      expectedSizes = [upper.remote.size, lower.remote.size]
      return setTimeout(done, 3500)
    })

    it('has the two files on local', function () {
      let f
      let files = fs.readdirSync(this.syncPath)
      files = ((() => {
        let result = []
        for (f of Array.from(files)) {
          if (f !== '.cozy-desktop') {
            result.push(f)
          }
        }
        return result
      })())
      files.length.should.equal(2)
      let sizes = (() => {
        let result1 = []
        for (f of Array.from(files)) {
          result1.push(fs.statSync(path.join(this.syncPath, f)).size)
        }
        return result1
      })()
      sizes.should.eql(expectedSizes)
      let names = files.sort()
      let parts = names[0].split('-conflict-')
      parts.length.should.equal(2)
      parts[0].should.equal(upper.name)
      names[1].should.equal(lower.name)
    })

    it('has the files on remote', done =>
      Files.getAllFiles(function (_, files) {
        let f
        files.length.should.equal(2)
        let sizes = ((() => {
          let result = []
          for (f of Array.from(files)) {
            result.push(f.size)
          }
          return result
        })())
        sizes.sort().should.eql(expectedSizes.sort())
        let names = ((() => {
          let result1 = []
          for (f of Array.from(files)) {
            result1.push(f.name)
          }
          return result1
        })()).sort()
        let parts = names[0].split('-conflict-')
        parts.length.should.equal(2)
        parts[0].should.equal(upper.name)
        names[1].should.equal(lower.name)
        done()
      })
    )
  })

  describe('a folder and a file', function () {
    let lower = {
      path: '',
      name: faker.commerce.product().toLowerCase()
    }
    let upper = {
      path: lower.path,
      name: lower.name.toUpperCase(),
      lastModification: '2015-11-13T02:03:05Z'
    }
    let child = {
      path: path.join(lower.path, lower.name),
      name: faker.commerce.color(),
      lastModification: '2015-10-12T01:02:03Z'
    }

    before(Files.deleteAll)
    before(Cozy.registerDevice)

    before('force case insensitive for local', function () {
      this.app.instanciate()
      this.app.prep.buildId = this.app.prep.buildIdHFS
    })

    before('Create the lower folder', done =>
      Files.createFolder(lower, function (_, created) {
        let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
        return Files.uploadFile(child, fixturePath, function (_, created) {
          child.remote = {
            id: created.id,
            size: fs.statSync(fixturePath).size
          }
          done()
        })
      })
    )

    before(Cozy.fetchRemoteMetadata)

    before('Create the upper file', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      return Files.uploadFile(upper, fixturePath, function (_, created) {
        upper.remote = {
          id: created.id,
          size: fs.statSync(fixturePath).size
        }
        done()
      })
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', done => setTimeout(done, 3500))

    it('has the two files on local', function () {
      let paths = fs.readdirSync(this.syncPath)
      paths = (Array.from(paths).filter((f) => f !== '.cozy-desktop').map((f) => f))
      paths.length.should.equal(2)
      let [file, folder] = paths
      let { size } = fs.statSync(path.join(this.syncPath, file))
      size.should.eql(upper.remote.size)
      let parts = file.split('-conflict-')
      parts.length.should.equal(2)
      parts[0].should.equal(upper.name)
      folder.should.equal(lower.name)
      let children = fs.readdirSync(path.join(this.syncPath, folder))
      children.length.should.equal(1)
      children[0].should.equal(child.name)
    })

    it('has the files on remote', done =>
      Files.getAllFolders(function (_, folders) {
        folders.length.should.equal(1)
        folders[0].should.have.properties(lower)
        return Files.getAllFiles(function (_, files) {
          files.length.should.equal(2)
          files[0]._id.should.equal(child.remote.id)
          files[0].path.should.equal(`/${child.path}`)
          files[0].name.should.equal(child.name)
          files[0].size.should.equal(child.remote.size)
          let parts = files[1].name.split('-conflict-')
          parts.length.should.equal(2)
          parts[0].should.equal(upper.name)
          files[1].path.should.equal(upper.path)
          files[1].size.should.equal(upper.remote.size)
          done()
        })
      })
    )
  })
})
