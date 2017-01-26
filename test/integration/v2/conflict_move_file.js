/* eslint-env mocha */

import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Conflict when moving a file', function () {
  this.slow(1000)
  this.timeout(10000)

  before(Cozy.ensurePreConditions)

  describe('on local', function () {
    let src = {
      path: '',
      name: faker.name.jobArea()
    }
    let file = {
      path: '',
      name: faker.name.jobType(),
      lastModification: '2015-10-13T02:04:08Z'
    }
    let expectedSizes = []

    before(Cozy.registerDevice)
    before(Files.deleteAll)

    before('Create the remote tree', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
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
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
      let filePath = path.join(this.syncPath, src.path, src.name)
      file.local = {size: fs.statSync(fixturePath).size}
      return fs.copySync(fixturePath, filePath)
    })

    before('Simulate works/latency for Sync', function () {
      this.app.instanciate()
      let { apply } = this.app.sync
      this.app.sync.apply = (change, callback) => {
        return setTimeout(() => {
          this.app.sync.apply = apply
          return this.app.sync.apply(change, callback)
        }
                , 3000)
      }
    })

    before(Cozy.sync)

    after(Cozy.clean)

    it('waits a bit to resolve the conflict', function (done) {
      expectedSizes = [file.remote.size, file.local.size]
      let srcPath = path.join(this.syncPath, src.path, src.name)
      let dstPath = path.join(this.syncPath, file.path, file.name)
      fs.renameSync(srcPath, dstPath)
      return setTimeout(done, 6000)
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
              sizes.sort().should.eql(expectedSizes.sort())
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

  describe('on remote', function () {
    let src = {
      path: '',
      name: faker.name.jobArea(),
      lastModification: '2015-10-13T02:04:08Z'
    }
    let file = {
      path: '',
      name: faker.name.jobType()
    }

    before(Cozy.registerDevice)
    before(Files.deleteAll)

    before('Create the remote tree', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
      return Files.uploadFile(src, fixturePath, function (_, created) {
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

    before(function (done) {
      file.id = file.remote.id
      return Files.updateFile(file, done)
    })

    before(Cozy.sync)

    after(Cozy.clean)

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
      sizes.should.eql([file.local.size, file.remote.size])
      let names = files.sort()
      names[0].should.equal(file.name)
      let parts = names[1].split('-conflict-')
      parts.length.should.equal(2)
      parts[0].should.equal(file.name)
    })

    it('has the two files on remote', done =>
            Files.getAllFiles(function (_, files) {
              let local, remote
              files.length.should.equal(2)
              if (files[0].name === file.name) {
                [local, remote] = files
              } else {
                [remote, local] = files
              }
              local.size.should.equal(file.local.size)
              local.name.should.equal(file.name)
              remote.size.should.equal(file.remote.size)
              let parts = remote.name.split('-conflict-')
              parts.length.should.equal(2)
              parts[0].should.equal(file.name)
              done()
            })
        )
  })
})
