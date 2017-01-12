/* eslint-env mocha */

import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

describe('Move a file', function () {
  this.slow(1000)
  this.timeout(10000)

  before(Cozy.ensurePreConditions)

  describe('on local', function () {
    let src = {
      path: '',
      name: faker.name.jobArea()
    }
    let dst = {
      path: '',
      name: faker.name.jobType()
    }

    before(Cozy.registerDevice)
    before(Files.deleteAll)
    before(Cozy.sync)
    after(Cozy.clean)

    it('create the local file', function () {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
      let filePath = path.join(this.syncPath, src.path, src.name)
      src.size = fs.statSync(fixturePath).size
      return fs.copySync(fixturePath, filePath)
    })

    it('waits a bit', done => setTimeout(done, 4000))

    it('renames the file', function (done) {
      let srcPath = path.join(this.syncPath, src.path, src.name)
      let dstPath = path.join(this.syncPath, dst.path, dst.name)
      return fs.rename(srcPath, dstPath, done)
    })

    it('waits a bit', done => setTimeout(done, 6000))

    it('has the file on local', function () {
      let files = fs.readdirSync(this.syncPath)
      files = (Array.from(files).filter((f) => f !== '.cozy-desktop').map((f) => f))
      files.length.should.equal(1)
      let { size } = fs.statSync(path.join(this.syncPath, files[0]))
      size.should.equal(src.size)
      files[0].should.equal(dst.name)
    })

    it('has the file on remote', done =>
      Files.getAllFiles(function (_, files) {
        files.length.should.equal(1)
        files[0].size.should.eql(src.size)
        files[0].name.should.equal(dst.name)
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
    let dst = {
      path: '',
      name: faker.name.jobType()
    }

    before(Cozy.registerDevice)
    before(Files.deleteAll)
    before(Cozy.sync)
    after(Cozy.clean)

    it('create the remote file', function (done) {
      let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon.jpg')
      return Files.uploadFile(src, fixturePath, function (_, created) {
        src.id = created.id
        src.size = fs.statSync(fixturePath).size
        done()
      })
    })

    it('waits a bit', done => setTimeout(done, 4000))

    it('renames the file', function (done) {
      dst.id = src.id
      return Files.updateFile(dst, done)
    })

    it('waits a bit', done => setTimeout(done, 4000))

    it('has the file on local', function () {
      let files = fs.readdirSync(this.syncPath)
      files = (Array.from(files).filter((f) => f !== '.cozy-desktop').map((f) => f))
      files.length.should.equal(1)
      let { size } = fs.statSync(path.join(this.syncPath, files[0]))
      size.should.equal(src.size)
      files[0].should.equal(dst.name)
    })

    it('has the file on remote', done =>
      Files.getAllFiles(function (_, files) {
        files.length.should.equal(1)
        files[0].size.should.eql(src.size)
        files[0].name.should.equal(dst.name)
        done()
      })
    )
  })
})
