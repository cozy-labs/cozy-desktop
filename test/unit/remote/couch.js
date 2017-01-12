/* eslint-env mocha */

import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import should from 'should'

import configHelpers from '../../helpers/config'
import couchHelpers from '../../helpers/couch'

import Couch from '../../../src/remote/couch'

describe('Couch', function () {
  before('instanciate config', configHelpers.createConfig)
  before('start couch server', couchHelpers.startServer)
  before('instanciate couch', couchHelpers.createCouchClient)
  beforeEach('create a document', function (done) {
    this.doc = {
      _id: Couch.newId(),
      docType: 'binary',
      checksum: '42'
    }
    return this.couch.put(this.doc, (err, created) => {
      should.not.exist(err)
      this.rev = created.rev
      done()
    })
  })
  after('stop couch server', couchHelpers.stopServer)
  after('clean config directory', configHelpers.cleanConfig)

  describe('newId', () =>
    it('returns a complex alpha-numeric chain', function () {
      Couch.newId().length.should.equal(32)
      Couch.newId().should.match(/^\w+$/i)
    })
  )

  describe('getLastRemoteChangeSeq', () =>
    it('gets the last change sequence number from couch', function (done) {
      return this.couch.getLastRemoteChangeSeq(function (err, seq) {
        should.not.exist(err)
        seq.should.be.aboveOrEqual(1)
        done()
      })
    })
  )

  describe('ping', () =>
    it('answers true if CouchDb is available', function (done) {
      return this.couch.ping(function (available) {
        available.should.be.true()
        done()
      })
    })
  )

  describe('get', () =>
    it('retrieves a document by its id', function (done) {
      return this.couch.get(this.doc._id, (err, doc) => {
        should.not.exist(err)
        should.exist(doc)
        doc._id.should.equal(this.doc._id)
        should.exist(doc._rev)
        doc.docType.should.equal('binary')
        done()
      })
    })
  )

  describe('put', function (done) {
    it('can create a new document', function (done) {
      let doc = {
        _id: Couch.newId(),
        docType: 'binary'
      }
      return this.couch.put(doc, function (err, created) {
        should.not.exist(err)
        should.exist(created)
        should.exist(created.id)
        should.exist(created.rev)
        done()
      })
    })

    it('can update a document', function (done) {
      this.doc.checksum = 'deadcafe'
      this.doc._rev = this.rev
      return this.couch.put(this.doc, (err, updated) => {
        should.not.exist(err)
        should.exist(updated)
        should.exist(updated.id)
        should.exist(updated.rev)
        return this.couch.get(this.doc._id, (err, doc) => {
          should.not.exist(err)
          doc.checksum.should.equal(this.doc.checksum)
          done()
        })
      })
    })
  })

  describe('remove', () =>
    it('deletes a document', function (done) {
      return this.couch.remove(this.doc._id, this.rev, function (err, deleted) {
        should.not.exist(err)
        should.exist(deleted)
        should.exist(deleted.id)
        should.exist(deleted.rev)
        done()
      })
    })
  )

  describe('uploadAsAttachment', function () {
    it('upload a file as an attachment to an existing doc', function (done) {
      let file = 'test/fixtures/chat-mignon.jpg'
      let mime = 'image/jpeg'
      return this.couch.uploadAsAttachment(this.doc._id, this.rev, mime, file, function (err, doc) {
        should.not.exist(err)
        should.exist(doc.id)
        should.exist(doc.rev)
        done()
      })
    })

    it('upload a stream as an attachment to an existing doc', function (done) {
      let stream = fs.createReadStream('test/fixtures/chat-mignon-mod.jpg')
      let mime = 'image/jpeg'
      return this.couch.uploadAsAttachment(this.doc._id, this.rev, mime, stream, function (err, doc) {
        should.not.exist(err)
        should.exist(doc.id)
        should.exist(doc.rev)
        done()
      })
    })

    it('has the correct content-type', function (done) {
      let stream = fs.createReadStream('test/fixtures/cool-pillow.jpg')
      let mime = 'image/jpeg'
      return this.couch.uploadAsAttachment(this.doc._id, this.rev, mime, stream, function (err, doc) {
        should.not.exist(err)
        return http.get(`${couchHelpers.url}/cozy/${doc.id}/file`, function (res) {
          res.headers['content-type'].should.equal(mime)
          done()
        })
      })
    })
  })

  describe('downloadBinary', () =>
    it('creates a readable stream from a remote binary doc', function (done) {
      let file = 'test/fixtures/chat-mignon.jpg'
      let mime = 'image/jpeg'
      return this.couch.uploadAsAttachment(this.doc._id, this.rev, mime, file, (err, doc) => {
        should.not.exist(err)
        let stream = fs.createReadStream(file)
        let checksum = crypto.createHash('sha1')
        checksum.setEncoding('hex')
        stream.pipe(checksum)
        return stream.on('end', () => {
          checksum.end()
          let sha1 = checksum.read()
          return this.couch.downloadBinary(this.doc._id, function (err, stream) {
            should.not.exist(err)
            checksum = crypto.createHash('sha1')
            checksum.setEncoding('hex')
            stream.pipe(checksum)
            return stream.on('end', function () {
              checksum.end()
              checksum.read().should.equal(sha1)
              done()
            })
          })
        })
      })
    })
  )

  describe('sameRemoteDoc', function () {
    it('returns true if the documents are the same', function () {
      let one = {
        _id: '5e93939833e147a78c61b115f50cc77d',
        _rev: '12-e91c1c55d2b82087682e32a30036a22b',
        docType: 'file',
        path: '',
        name: 'planche.jpg',
        creationDate: '2015-11-23T15:30:01.831Z',
        lastModification: '2015-11-23T15:30:01.831Z',
        checksum: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9',
        size: 539118,
        class: 'image',
        mime: 'image/jpeg',
        binary: {
          file: {
            id: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9',
            rev: '7-39a6777ab539b47d046888011f4f089d'
          },
          thumb: {
            id: 'df8d4874a4d8316877abf61b3e0057a0',
            rev: '2-d3540f14ece76cd5104c0059871f0373'
          }
        }
      }
      let two = {
        _id: '24af4c7ae9454f7e9d1f78219554cf19',
        docType: 'file',
        path: '',
        name: 'planche.jpg',
        creationDate: '2015-11-23T15:30:01.831Z',
        lastModification: '2015-11-23T15:30:01.831Z',
        checksum: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9',
        size: 539118,
        class: 'image',
        mime: 'image/jpeg'
      }
      this.couch.sameRemoteDoc(one, two).should.be.true()
    })

    it('returns false if the documents are different', function () {
      let one = {
        _id: '5e93939833e147a78c61b115f50cc77d',
        _rev: '12-e91c1c55d2b82087682e32a30036a22b',
        docType: 'file',
        path: '',
        name: 'planche.jpg',
        creationDate: '2015-11-23T15:30:01.831Z',
        lastModification: '2015-11-23T15:30:01.831Z',
        checksum: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9',
        size: 539118,
        class: 'image',
        mime: 'image/jpeg',
        binary: {
          file: {
            id: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9',
            rev: '7-39a6777ab539b47d046888011f4f089d'
          },
          thumb: {
            id: 'df8d4874a4d8316877abf61b3e0057a0',
            rev: '2-d3540f14ece76cd5104c0059871f0373'
          }
        }
      }
      let two = {
        _id: '85f39bb308ea4340a606970c1b9e2bb8',
        docType: 'file',
        path: '',
        name: 'planche.jpg',
        creationDate: '2015-11-23T15:23:46.352Z',
        lastModification: '2015-11-23T15:23:46.352Z',
        checksum: 'c584315c6fd2155030808ee96fdf80bf20161cc3',
        size: 84980,
        class: 'image',
        mime: 'image/jpeg'
      }
      this.couch.sameRemoteDoc(one, two).should.be.false()
    })
  })
})
