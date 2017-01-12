/* eslint-env mocha */

import async from 'async'
import clone from 'lodash.clone'
import path from 'path'
import sinon from 'sinon'
import should from 'should'

import configHelpers from '../../helpers/config'
import couchHelpers from '../../helpers/couch'
import pouchHelpers from '../../helpers/pouch'

import Prep from '../../../src/prep'
import Watcher from '../../../src/remote/watcher'

describe('RemoteWatcher Tests', function () {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('start couch server', couchHelpers.startServer)
  before('instanciate couch', couchHelpers.createCouchClient)
  before('instanciate remote watcher', function () {
    this.prep = {invalidPath: Prep.prototype.invalidPath}
    this.watcher = new Watcher(this.couch, this.prep, this.pouch)
  })
  after('stop couch server', couchHelpers.stopServer)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  before(function (done) {
    return pouchHelpers.createParentFolder(this.pouch, () => {
      return async.eachSeries([1, 2, 3], (i, callback) => {
        return pouchHelpers.createFolder(this.pouch, i, () => {
          return pouchHelpers.createFile(this.pouch, i, callback)
        })
      }, done)
    })
  })

  describe('onChange', function () {
    it('does not fail when the path is missing', function (done) {
      let doc = {
        _id: '12345678904',
        _rev: '1-abcdef',
        docType: 'file',
        binary: {
          file: {
            id: '123'
          }
        }
      }
      return this.watcher.onChange(doc, function (err) {
        should.exist(err)
        err.message.should.equal('Invalid path/name')
        done()
      })
    })

    it('does not fail on ghost file', function (done) {
      sinon.stub(this.watcher, 'putDoc')
      let doc = {
        _id: '12345678904',
        _rev: '1-abcdef',
        docType: 'file',
        path: 'foo',
        name: 'bar'
      }
      return this.watcher.onChange(doc, _ => {
        this.watcher.putDoc.called.should.be.false()
        this.watcher.putDoc.restore()
        done()
      })
    })

    it('calls addDoc for a new doc', function (done) {
      this.prep.addDoc = sinon.stub().yields(null)
      let doc = {
        _id: '12345678905',
        _rev: '1-abcdef',
        docType: 'file',
        path: 'my-folder',
        name: 'file-5',
        checksum: '9999999999999999999999999999999999999999',
        tags: [],
        localPath: '/storage/DCIM/IMG_123.jpg',
        binary: {
          file: {
            id: '1234',
            rev: '5-6789'
          }
        }
      }
      return this.watcher.onChange(clone(doc), err => {
        should.not.exist(err)
        this.prep.addDoc.called.should.be.true()
        let args = this.prep.addDoc.args[0]
        args[0].should.equal('remote')
        args[1].should.have.properties({
          path: path.join(doc.path, doc.name),
          docType: 'file',
          checksum: doc.checksum,
          tags: doc.tags,
          localPath: doc.localPath,
          remote: {
            _id: doc._id,
            _rev: doc._rev,
            binary: {
              _id: doc.binary.file.id,
              _rev: doc.binary.file.rev
            }
          }
        })
        args[1].should.not.have.properties(['_rev', 'path', 'name'])
        done()
      })
    })

    it('calls updateDoc when tags are updated', function (done) {
      this.prep.updateDoc = sinon.stub().yields(null)
      let doc = {
        _id: '12345678901',
        _rev: '2-abcdef',
        docType: 'file',
        path: 'my-folder',
        name: 'file-1',
        checksum: '1111111111111111111111111111111111111111',
        tags: ['foo', 'bar', 'baz'],
        binary: {
          file: {
            id: '1234',
            rev: '5-6789'
          }
        }
      }
      return this.watcher.onChange(clone(doc), err => {
        should.not.exist(err)
        this.prep.updateDoc.called.should.be.true()
        let args = this.prep.updateDoc.args[0]
        args[0].should.equal('remote')
        args[1].should.have.properties({
          path: path.join(doc.path, doc.name),
          docType: 'file',
          checksum: doc.checksum,
          tags: doc.tags,
          remote: {
            _id: doc._id,
            _rev: doc._rev,
            binary: {
              _id: doc.binary.file.id,
              _rev: doc.binary.file.rev
            }
          }
        })
        args[1].should.not.have.properties(['_rev', 'path', 'name'])
        done()
      }
            )
    })

    it('calls updateDoc when content is overwritten', function (done) {
      this.prep.updateDoc = sinon.stub().yields(null)
      let doc = {
        _id: '12345678901',
        _rev: '3-abcdef',
        docType: 'file',
        path: '/my-folder',
        name: 'file-1',
        checksum: '9999999999999999999999999999999999999999',
        tags: ['foo', 'bar', 'baz'],
        binary: {
          file: {
            id: '4321',
            rev: '9-8765'
          }
        }
      }
      return this.watcher.onChange(clone(doc), err => {
        should.not.exist(err)
        this.prep.updateDoc.called.should.be.true()
        let args = this.prep.updateDoc.args[0]
        args[0].should.equal('remote')
        args[1].should.have.properties({
          path: 'my-folder/file-1',
          docType: 'file',
          checksum: doc.checksum,
          tags: doc.tags,
          remote: {
            _id: doc._id,
            _rev: doc._rev,
            binary: {
              _id: doc.binary.file.id,
              _rev: doc.binary.file.rev
            }
          }
        })
        args[1].should.not.have.properties(['_rev', 'path', 'name'])
        done()
      }
            )
    })

    it('calls moveDoc when file is renamed', function (done) {
      this.prep.moveDoc = sinon.stub().yields(null)
      let doc = {
        _id: '12345678902',
        _rev: '4-abcdef',
        docType: 'file',
        path: 'my-folder',
        name: 'file-2-bis',
        checksum: '1111111111111111111111111111111111111112',
        tags: [],
        binary: {
          file: {
            id: '4321',
            rev: '9-8765'
          }
        }
      }
      return this.watcher.onChange(clone(doc), err => {
        should.not.exist(err)
        this.prep.moveDoc.called.should.be.true()
        let args = this.prep.moveDoc.args[0]
        args[0].should.equal('remote')
        let src = args[2]
        src.should.have.properties({
          path: 'my-folder/file-2',
          docType: 'file',
          checksum: doc.checksum,
          tags: doc.tags,
          remote: {
            _id: '12345678902'
          }
        })
        let dst = args[1]
        dst.should.have.properties({
          path: path.join(doc.path, doc.name),
          docType: 'file',
          checksum: doc.checksum,
          tags: doc.tags,
          remote: {
            _id: doc._id,
            _rev: doc._rev,
            binary: {
              _id: doc.binary.file.id,
              _rev: doc.binary.file.rev
            }
          }
        })
        dst.should.not.have.properties(['_rev', 'path', 'name'])
        done()
      })
    })

    it('calls moveDoc when file is moved', function (done) {
      this.prep.moveDoc = sinon.stub().yields(null)
      let doc = {
        _id: '12345678902',
        _rev: '5-abcdef',
        docType: 'file',
        path: 'another-folder/in/some/place',
        name: 'file-2-ter',
        checksum: '1111111111111111111111111111111111111112',
        tags: [],
        binary: {
          file: {
            id: '4321',
            rev: '9-8765'
          }
        }
      }
      return this.watcher.onChange(clone(doc), err => {
        should.not.exist(err)
        this.prep.moveDoc.called.should.be.true()
        let src = this.prep.moveDoc.args[0][2]
        src.should.have.properties({
          path: 'my-folder/file-2',
          docType: 'file',
          checksum: doc.checksum,
          tags: doc.tags,
          remote: {
            _id: '12345678902'
          }
        })
        let dst = this.prep.moveDoc.args[0][1]
        dst.should.have.properties({
          path: path.join(doc.path, doc.name),
          docType: 'file',
          checksum: doc.checksum,
          tags: doc.tags,
          remote: {
            _id: doc._id,
            _rev: doc._rev,
            binary: {
              _id: doc.binary.file.id,
              _rev: doc.binary.file.rev
            }
          }
        })
        dst.should.not.have.properties(['_rev', 'path', 'name'])
        done()
      })
    })

    it('calls deletedDoc&addDoc when file has changed completely', function (done) {
      this.prep.deleteDoc = sinon.stub().yields(null)
      this.prep.addDoc = sinon.stub().yields(null)
      let doc = {
        _id: '12345678903',
        _rev: '6-abcdef',
        docType: 'file',
        path: 'another-folder/in/some/place',
        name: 'file-3-bis',
        checksum: '8888888888888888888888888888888888888888',
        tags: [],
        binary: {
          file: {
            id: '1472',
            rev: '5-8369'
          }
        }
      }
      return this.watcher.onChange(clone(doc), err => {
        should.not.exist(err)
        this.prep.deleteDoc.called.should.be.true()
        let id = this.prep.deleteDoc.args[0][1].path
        id.should.equal('my-folder/file-3')
        this.prep.addDoc.called.should.be.true()
        let args = this.prep.addDoc.args[0]
        args[0].should.equal('remote')
        args[1].should.have.properties({
          path: path.join(doc.path, doc.name),
          docType: 'file',
          checksum: doc.checksum,
          tags: doc.tags,
          remote: {
            _id: doc._id,
            _rev: doc._rev,
            binary: {
              _id: doc.binary.file.id,
              _rev: doc.binary.file.rev
            }
          }
        })
        args[1].should.not.have.properties(['_rev', 'path', 'name'])
        done()
      })
    })

    it('calls deleteDoc for a deleted doc', function (done) {
      this.prep.deleteDoc = sinon.stub().yields(null)
      let doc = {
        _id: '12345678901',
        _rev: '7-abcdef',
        _deleted: true
      }
      return this.watcher.onChange(doc, err => {
        should.not.exist(err)
        this.prep.deleteDoc.called.should.be.true()
        let id = this.prep.deleteDoc.args[0][1].path
        id.should.equal('my-folder/file-1')
        done()
      })
    })

    it('calls addDoc for folder created by the mobile app', function (done) {
      this.prep.addDoc = sinon.stub().yields(null)
      let doc = {
        _id: '913F429E-5609-C636-AE9A-CD00BD138B13',
        _rev: '1-7786acf12a11fad6ad1eeb861953e0d8',
        docType: 'Folder',
        name: 'Photos from devices',
        path: '',
        lastModification: '2015-09-29T14:13:33.384Z',
        creationDate: '2015-09-29T14:13:33.384Z',
        tags: []
      }
      return this.watcher.onChange(doc, err => {
        should.not.exist(err)
        this.prep.addDoc.called.should.be.true()
        this.prep.addDoc.args[0][1].should.have.properties({
          path: 'Photos from devices',
          docType: 'folder',
          lastModification: '2015-09-29T14:13:33.384Z',
          creationDate: '2015-09-29T14:13:33.384Z',
          tags: [],
          remote: {
            _id: '913F429E-5609-C636-AE9A-CD00BD138B13',
            _rev: '1-7786acf12a11fad6ad1eeb861953e0d8'
          }
        })
        done()
      })
    })
  })

  describe('removeRemote', () =>
    it('remove the association between a document and its remote', function (done) {
      let doc = {
        _id: 'removeRemote',
        path: 'removeRemote',
        docType: 'file',
        checksum: 'd3e2163ccd0c497969233a6bd2a4ac843fb8165e',
        sides: {
          local: 2,
          remote: 1
        }
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        return this.pouch.db.get(doc._id, (err, was) => {
          should.not.exist(err)
          return this.watcher.removeRemote(was, err => {
            should.not.exist(err)
            return this.pouch.db.get(doc._id, function (err, actual) {
              should.not.exist(err)
              should.not.exist(actual.sides.remote)
              should.not.exist(actual.remote)
              actual._id.should.equal(doc._id)
              actual.sides.local.should.equal(2)
              done()
            })
          })
        })
      })
    })
  )
})
