/* eslint-env mocha */

import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Conflict between two files', function () {
  this.slow(1000)
  this.timeout(10000)

  before(Cozy.ensurePreConditions)

  describe('with local first', function () {
    let file = {
      path: '',
      name: faker.commerce.color(),
      lastModification: '2015-10-12T01:02:03Z'
    }
    let expectedSizes = []

    before(Files.deleteAll)
    before(Cozy.registerDevice)

    before('Create the remote tree', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
      return Files.uploadFile(file, fixturePath, function (_, created) {
        file.remote = {
          id: created.id,
          size: fs.statSync(fixturePath).size
        }
        done()
      })
    })

    before('Create the local tree', function () {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      let filePath = path.join(this.syncPath, file.path, file.name)
      file.local = {size: fs.statSync(fixturePath).size}
      return fs.copySync(fixturePath, filePath)
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', function (done) {
      expectedSizes = [file.local.size, file.remote.size].sort()
      return setTimeout(done, 3000)
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
      sizes.sort().should.eql(expectedSizes)
      let names = files.sort()
      names[0].should.equal(file.name)
      let parts = names[1].split('-conflict-')
      parts.length.should.equal(2)
      parts[0].should.equal(file.name)
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
        sizes.sort().should.eql(expectedSizes)
        let names = ((() => {
          let result1 = []
          for (f of Array.from(files)) {
            result1.push(f.name)
          }
          return result1
        })()).sort()
        names[0].should.equal(file.name)
        let parts = names[1].split('-conflict-')
        parts.length.should.equal(2)
        parts[0].should.equal(file.name)
        done()
      })
    )
  })

  describe('with remote first', function () {
    let file = {
      path: '',
      name: faker.commerce.department(),
      lastModification: '2015-10-13T02:04:06Z'
    }
    let expectedSizes = []

    before(Cozy.registerDevice)
    before(Files.deleteAll)

    before('Create the remote tree', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
      return Files.uploadFile(file, fixturePath, function (_, created) {
        file.remote = {
          id: created.id,
          size: fs.statSync(fixturePath).size
        }
        done()
      })
    })

    before(Cozy.fetchRemoteMetadata)

    before('Create the local tree', function () {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      let filePath = path.join(this.syncPath, file.path, file.name)
      file.local = {size: fs.statSync(fixturePath).size}
      return fs.copySync(fixturePath, filePath)
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', function (done) {
      expectedSizes = [file.local.size, file.remote.size].sort()
      return setTimeout(done, 1500)
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
      sizes.sort().should.eql(expectedSizes)
      let names = files.sort()
      names[0].should.equal(file.name)
      let parts = names[1].split('-conflict-')
      parts.length.should.equal(2)
      parts[0].should.equal(file.name)
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
        sizes.sort().should.eql(expectedSizes)
        let names = ((() => {
          let result1 = []
          for (f of Array.from(files)) {
            result1.push(f.name)
          }
          return result1
        })()).sort()
        names[0].should.equal(file.name)
        let parts = names[1].split('-conflict-')
        parts.length.should.equal(2)
        parts[0].should.equal(file.name)
        done()
      })
    )
  })
})
