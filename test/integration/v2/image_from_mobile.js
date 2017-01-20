/* eslint-env mocha */

import faker from 'faker'
import fs from 'fs-extra'
import path from 'path'
import request from 'request-json-light'
import should from 'should'

import Cozy from '../helpers/integration'
import Files from '../helpers/files'

// Images imported from cozy-mobile are special because they have no checksum
describe('Image from mobile', function () {
  this.slow(1000)
  this.timeout(10000)

  before(Cozy.ensurePreConditions)
  before(Files.deleteAll)
  before(Cozy.registerDevice)

  let file = {
    path: '',
    name: faker.commerce.color(),
    lastModification: '2015-10-12T01:02:03Z',
    checksum: 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
  }
  let localPath = '/storage/emulated/0/DCIM/Camera/IMG_20160411_172611324.jpg'

  before('Create the remote file', function (done) {
    let fixturePath = path.join(Cozy.fixturesDir, 'chat-mignon-mod.jpg')
    return Files.uploadFile(file, fixturePath, function (_, created) {
      file.remote = {id: created.id}
      file.size = fs.statSync(fixturePath).size
      done()
    })
  })

  before('Remove the checksum and add tags + localPath', function () {
    this.app.instanciate()
    let client = this.app.remote.couch
    return client.get(file.remote.id, function (err, doc) {
      should.not.exist(err)
      delete doc.checksum
      doc.tags = ['foo', 'bar']
      doc.localPath = localPath
      client.put(doc, (err, updated) => should.not.exist(err))
    })
  })

  before(Cozy.sync)
  after(Cozy.clean)

  it('waits a bit to do the synchronization', done => setTimeout(done, 5000))

  it('has the file on local', function () {
    let files = fs.readdirSync(this.syncPath)
    files = (Array.from(files).filter((f) => f !== '.cozy-desktop').map((f) => f))
    files.length.should.equal(1)
    let local = files[0]
    local.should.equal(file.name)
    let { size } = fs.statSync(path.join(this.syncPath, local))
    size.should.equal(file.size)
  })

  it('has the file on remote', done =>
    Files.getAllFiles(function (_, files) {
      files.length.should.equal(1)
      let remote = files[0]
      remote.name.should.equal(file.name)
      remote.size.should.equal(file.size)
      remote.checksum.should.equal(file.checksum)
      remote.tags.should.eql(['foo', 'bar'])
      done()
    })
  )

  it('has kept the localPath on the remote file', function (done) {
    let client = request.newClient('http://localhost:5984/')
    return client.get(`cozy/${file.remote.id}`, function (err, res, body) {
      should.not.exist(err)
      body.localPath.should.equal(localPath)
      done()
    })
  })
})
