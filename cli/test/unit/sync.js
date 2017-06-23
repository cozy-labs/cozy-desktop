/* eslint-env mocha */

import path from 'path'
import sinon from 'sinon'
import should from 'should'

import Ignore from '../../src/ignore'
import Sync from '../../src/sync'

import configHelpers from '../helpers/config'
import pouchHelpers from '../helpers/pouch'

describe('Sync', function () {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('start', function () {
    beforeEach('instanciate sync', function () {
      const ret = {
        started: Promise.resolve(),
        running: new Promise(() => {})
      }
      this.local = {
        start: sinon.stub().resolves(),
        stop: sinon.stub().resolves()
      }
      this.remote = {
        start: sinon.stub().returns(ret),
        stop: sinon.stub().resolves()
      }
      this.ignore = new Ignore([])
      this.events = {}
      this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
      this.sync.sync = sinon.stub().rejects(new Error('stopped'))
    })

    it('starts the metadata replication of remote in read only', function (done) {
      this.sync.start('pull').catch(err => {
        err.message.should.equal('stopped')
        this.local.start.called.should.be.false()
        this.remote.start.calledOnce.should.be.true()
        this.sync.sync.calledOnce.should.be.true()
        done()
      })
    })

    it('starts the metadata replication of local in write only', function (done) {
      this.sync.start('push').catch(err => {
        err.message.should.equal('stopped')
        this.local.start.calledOnce.should.be.true()
        this.remote.start.called.should.be.false()
        this.sync.sync.calledOnce.should.be.true()
        done()
      })
    })

    it('starts the metadata replication of both in full', function (done) {
      this.sync.start('full').catch(err => {
        err.message.should.equal('stopped')
        this.local.start.calledOnce.should.be.true()
        this.remote.start.calledOnce.should.be.true()
        this.sync.sync.calledOnce.should.be.true()
        done()
      })
    })

    it('does not start sync if metadata replication fails', function (done) {
      this.local.start = sinon.stub().rejects(new Error('failed'))
      this.sync.start('full').catch(err => {
        err.message.should.equal('failed')
        this.local.start.calledOnce.should.be.true()
        this.remote.start.called.should.be.false()
        this.sync.sync.calledOnce.should.be.false()
        done()
      })
    })
  })

  describe('sync', function () {
    beforeEach(function () {
      this.local = {}
      this.remote = {}
      this.ignore = new Ignore([])
      this.events = {emit: sinon.spy()}
      this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
      this.sync.apply = sinon.stub().resolves()
      this.sync.running = true
    })

    it('calls pop and apply', function (done) {
      this.sync.pop = sinon.stub().resolves({ change: true })
      this.sync.sync().then(() => {
        this.sync.pop.calledOnce.should.be.true()
        this.sync.apply.calledOnce.should.be.true()
        this.sync.apply.calledWith({change: true}).should.be.true()
        done()
      })
    })

    it('calls pop but not apply if pop has failed', function (done) {
      this.sync.pop = sinon.stub().rejects(new Error('failed'))
      this.sync.sync().catch(err => {
        err.message.should.equal('failed')
        this.sync.pop.calledOnce.should.be.true()
        this.sync.apply.calledOnce.should.be.false()
        done()
      })
    })
  })

  describe('pop', function () {
    beforeEach(function (done) {
      this.local = {}
      this.remote = {}
      this.ignore = new Ignore([])
      this.events = {emit: sinon.spy()}
      this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
      this.pouch.db.changes().on('complete', info => {
        this.pouch.setLocalSeq(info.last_seq, done)
      })
    })

    it('gives the next change if there is already one', function (done) {
      pouchHelpers.createFile(this.pouch, 1, err => {
        should.not.exist(err)
        this.sync.pop().then(change => {
          this.pouch.getLocalSeq(function (err, seq) {
            should.not.exist(err)
            change.should.have.properties({
              id: path.normalize('my-folder/file-1'),
              seq: seq + 1
            })
            change.doc.should.have.properties({
              _id: path.normalize('my-folder/file-1'),
              docType: 'file',
              tags: []})
            done()
          })
        })
      })
    })

    it('filters design doc changes', function (done) {
      let query = `
function(doc) {
    if ('size' in doc) emit(doc.size);
}`
      this.pouch.createDesignDoc('bySize', query, err => {
        should.not.exist(err)
        pouchHelpers.createFile(this.pouch, 6, err => {
          should.not.exist(err)
          this.sync.pop().then(change => {
            change.doc.docType.should.equal('file')
            done()
          })
        })
      })
    })

    it('waits for the next change if there no available change', function (done) {
      let spy = sinon.spy()
      this.sync.pop().then(change => {
        spy()
        this.pouch.getLocalSeq(function (err, seq) {
          should.not.exist(err)
          change.should.have.properties({
            id: path.normalize('my-folder/file-7'),
            seq: seq + 1
          })
          change.doc.should.have.properties({
            _id: path.normalize('my-folder/file-7'),
            docType: 'file',
            tags: []})
          done()
        })
      })
      setTimeout(() => {
        spy.called.should.be.false()
        pouchHelpers.createFile(this.pouch, 7, err => should.not.exist(err))
      }, 10)
    })

    it('emits up-to-date if there are no available change', function (done) {
      let emitted = false
      this.events.emit = () => {
        emitted = true
        pouchHelpers.createFile(this.pouch, 8, err => should.not.exist(err))
      }
      this.sync.pop().then(change => {
        emitted.should.be.true()
        done()
      })
    })
  })

  describe('apply', function () {
    beforeEach(function () {
      this.local = {}
      this.remote = {}
      this.ignore = new Ignore(['ignored'])
      this.events = {}
      this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
    })

    it('does nothing for an ignored document', function (done) {
      let change = {
        seq: 121,
        doc: {
          _id: 'ignored',
          docType: 'folder',
          sides: {
            local: 1
          }
        }
      }
      this.sync.folderChanged = sinon.spy()
      this.sync.apply(change).then(() => {
        this.sync.folderChanged.called.should.be.false()
        done()
      })
    })

    it('does nothing for an up-to-date document', function (done) {
      let change = {
        seq: 122,
        doc: {
          _id: 'foo',
          docType: 'folder',
          sides: {
            local: 1,
            remote: 1
          }
        }
      }
      this.sync.folderChanged = sinon.spy()
      this.sync.apply(change).then(() => {
        this.sync.folderChanged.called.should.be.false()
        done()
      })
    })

    it('trashes a locally deleted file or folder', function (done) {
      const change = {
        seq: 145,
        doc: {
          _id: 'foo',
          path: 'foo',
          sides: {
            local: 2,
            remote: 1
          },
          trashed: true
        }
      }

      this.sync.trashWithParentOrByItself = sinon.stub().resolves(true)
      this.sync.apply(change).then(() => {
        should(this.sync.trashWithParentOrByItself.called).be.true()
        done()
      })
    })

    it('calls fileChanged for a file', function (done) {
      let change = {
        seq: 123,
        doc: {
          _id: 'foo/bar',
          docType: 'file',
          md5sum: '0000000000000000000000000000000000000000',
          sides: {
            local: 1
          }
        }
      }
      this.sync.fileChangedAsync = sinon.stub().resolves()
      this.sync.apply(change).then(() => {
        this.sync.fileChangedAsync.called.should.be.true()
        this.sync.fileChangedAsync.calledWith(change.doc).should.be.true()
        this.pouch.db.get(change.doc._id, function (err, doc) {
          should.not.exist(err)
          doc.should.have.properties({
            _id: 'foo/bar',
            docType: 'file',
            sides: {
              local: 1,
              remote: 1
            }
          })
          done()
        })
      })
    })

    it('calls folderChanged for a folder', function (done) {
      let change = {
        seq: 124,
        doc: {
          _id: 'foo/baz',
          docType: 'folder',
          tags: [],
          sides: {
            local: 1
          }
        }
      }
      this.sync.folderChangedAsync = sinon.stub().resolves()
      this.sync.apply(change).then(() => {
        this.sync.folderChangedAsync.called.should.be.true()
        this.sync.folderChangedAsync.calledWith(change.doc).should.be.true()
        this.pouch.getLocalSeq(function (_, seq) {
          seq.should.equal(124)
          done()
        })
      })
    })
  })

  describe('updateErrors', function () {
    this.timeout(5000)

    beforeEach(function () {
      this.local = {}
      this.remote = {}
      this.ignore = new Ignore([])
      this.events = {}
      this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
    })

    it('stops retrying after 3 errors', function (done) {
      let doc = {
        _id: 'third/failure',
        errors: 3
      }
      this.pouch.db.put(doc, (err, infos) => {
        should.not.exist(err)
        doc._rev = infos.rev
        this.sync.updateErrors({doc}).then(() => {
          this.pouch.db.get(doc._id, function (err, actual) {
            should.not.exist(err)
            actual.errors.should.equal(3)
            actual._rev.should.equal(doc._rev)
            done()
          })
        })
      })
    })
  })

  describe('fileChanged', function () {
    beforeEach(function () {
      this.local = {}
      this.remote = {}
      this.ignore = new Ignore([])
      this.events = {}
      this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)

      this.local.trashAsync = sinon.stub()
      this.remote.trashAsync = sinon.stub()

      this.local.trashAsync.returnsPromise().resolves()
      this.remote.trashAsync.returnsPromise().resolves()
    })

    it('calls addFileAsync for an added file', function (done) {
      let doc = {
        _id: 'foo/bar',
        _rev: '1-abcdef0123456789',
        md5sum: '391f7abfca1124c3ca937e5f85687352bcd9f261',
        docType: 'file',
        sides: {
          local: 1
        }
      }
      this.remote.addFileAsync = sinon.stub()
      this.remote.addFileAsync.returnsPromise().resolves()
      this.sync.fileChangedAsync(doc, this.remote, 0).then(() => {
        this.remote.addFileAsync.calledWith(doc).should.be.true()
        done()
      })
    })

    it('calls overwriteFileAsync for an overwritten file', function (done) {
      let doc = {
        _id: 'overwrite/foo/bar',
        md5sum: '391f7abfca1124c3ca937e5f85687352bcd9f261',
        docType: 'file',
        sides: {
          local: 1
        }
      }
      this.pouch.db.put(doc, (err, created) => {
        should.not.exist(err)
        doc._rev = created.rev
        doc.md5sum = '389dd709c94a6a7ea56e1d55cbf65eef31b9bc5e'
        doc.sides = {
          local: 2,
          remote: 1
        }
        this.pouch.db.put(doc, (_, updated) => {
          this.remote.overwriteFileAsync = sinon.stub()
          this.remote.overwriteFileAsync.returnsPromise().resolves()
          this.remote.updateFileMetadataAsync = sinon.stub()
          this.remote.updateFileMetadataAsync.returnsPromise().resolves()
          this.sync.fileChangedAsync(doc, this.remote, 1).then(() => {
            this.remote.updateFileMetadataAsync.called.should.be.false()
            this.remote.overwriteFileAsync.calledWith(doc).should.be.true()
            done()
          })
        })
      })
    })

    it('calls updateFileMetadataAsync for updated file metadata', function (done) {
      let doc = {
        _id: 'update/foo/bar',
        md5sum: '391f7abfca1124c3ca937e5f85687352bcd9f261',
        docType: 'file',
        sides: {
          local: 1
        }
      }
      this.pouch.db.put(doc, (err, created) => {
        should.not.exist(err)
        doc._rev = created.rev
        doc.tags = ['courge']
        doc.sides = {
          local: 2,
          remote: 1
        }
        this.pouch.db.put(doc, (_, updated) => {
          this.remote.overwriteFileAsync = sinon.stub()
          this.remote.overwriteFileAsync.returnsPromise().resolves()
          this.remote.updateFileMetadataAsync = sinon.stub()
          this.remote.updateFileMetadataAsync.returnsPromise().resolves()
          this.sync.fileChangedAsync(doc, this.remote, 1).then(() => {
            this.remote.overwriteFileAsync.called.should.be.false()
            let ufm = this.remote.updateFileMetadataAsync
            ufm.calledWith(doc).should.be.true()
            done()
          })
        })
      })
    })

    it('calls moveFileAsync for a moved file', function (done) {
      let was = {
        _id: 'foo/bar',
        _rev: '3-9876543210',
        _deleted: true,
        moveTo: 'foo/baz',
        docType: 'file',
        tags: ['qux'],
        sides: {
          local: 3,
          remote: 2
        }
      }
      let doc = {
        _id: 'foo/baz',
        _rev: '1-abcdef',
        docType: 'file',
        tags: ['qux'],
        sides: {
          local: 1
        }
      }
      this.remote.trashAsync = sinon.stub()
      this.remote.trashAsync.returnsPromise().resolves()
      this.remote.addFileAsync = sinon.stub()
      this.remote.addFileAsync.returnsPromise().resolves()
      this.remote.moveFileAsync = sinon.stub()
      this.remote.moveFileAsync.returnsPromise().resolves()
      this.sync.fileChangedAsync(was, this.remote, 2).then(() => {
        this.remote.trashAsync.called.should.be.false()
        this.sync.fileChangedAsync(doc, this.remote, 0).then(() => {
          this.remote.addFileAsync.called.should.be.false()
          this.remote.moveFileAsync.calledWith(doc, was).should.be.true()
          done()
        })
      })
    })

    it('calls trashAsync for a deleted file', function (done) {
      let doc = {
        _id: 'foo/baz',
        _rev: '4-1234567890',
        _deleted: true,
        docType: 'file',
        sides: {
          local: 1,
          remote: 2
        }
      }
      this.sync.fileChangedAsync(doc, this.local, 1).then(() => {
        this.local.trashAsync.calledWith(doc).should.be.true()
        done()
      })
    })

    it('does nothing for a deleted file that was not added', function (done) {
      let doc = {
        _id: 'tmp/fooz',
        _rev: '2-1234567890',
        _deleted: true,
        docType: 'file',
        sides: {
          local: 2
        }
      }
      this.sync.fileChangedAsync(doc, this.remote, 0).then(() => {
        this.remote.trashAsync.called.should.be.false()
        done()
      })
    })
  })

  describe('folderChanged', function () {
    beforeEach(function () {
      this.local = {}
      this.remote = {}
      this.ignore = new Ignore([])
      this.events = {}
      this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)

      this.local.trashAsync = sinon.stub()
      this.remote.trashAsync = sinon.stub()
    })

    it('calls addFolderAsync for an added folder', function (done) {
      let doc = {
        _id: 'foobar/bar',
        _rev: '1-abcdef0123456789',
        docType: 'folder',
        sides: {
          local: 1
        }
      }
      this.remote.addFolderAsync = sinon.stub()
      this.remote.addFolderAsync.returnsPromise().resolves()
      this.sync.folderChangedAsync(doc, this.remote, 0).then(() => {
        this.remote.addFolderAsync.calledWith(doc).should.be.true()
        done()
      })
    })

    xit('calls updateFolderAsync for an updated folder', function (done) {
      let doc = {
        _id: 'foobar/bar',
        _rev: '2-abcdef9876543210',
        docType: 'folder',
        tags: ['qux'],
        sides: {
          local: 1,
          remote: 2
        }
      }
      this.local.updateFolderAsync = sinon.stub()
      this.local.updateFolderAsync.returnsPromise().resolves()
      this.sync.folderChangedAsync(doc, this.local, 1).then(() => {
        this.local.updateFolderAsync.calledWith(doc).should.be.true()
        done()
      })
    })

    it('calls moveFolderAsync for a moved folder', function (done) {
      let was = {
        _id: 'foobar/bar',
        _rev: '3-9876543210',
        _deleted: true,
        moveTo: 'foobar/baz',
        docType: 'folder',
        tags: ['qux'],
        sides: {
          local: 3,
          remote: 2
        }
      }
      let doc = {
        _id: 'foobar/baz',
        _rev: '1-abcdef',
        docType: 'folder',
        tags: ['qux'],
        sides: {
          local: 1
        }
      }
      this.remote.trashAsync = sinon.stub()
      this.remote.trashAsync.returnsPromise().resolves()
      this.remote.addFolderAsync = sinon.stub()
      this.remote.addFolderAsync.returnsPromise().resolves()
      this.remote.moveFolderAsync = sinon.stub()
      this.remote.moveFolderAsync.returnsPromise().resolves()
      this.sync.folderChangedAsync(was, this.remote, 2).then(() => {
        this.remote.trashAsync.called.should.be.false()
        this.sync.folderChangedAsync(doc, this.remote, 0).then(() => {
          this.remote.addFolderAsync.called.should.be.false()
          this.remote.moveFolderAsync.calledWith(doc, was).should.be.true()
          done()
        })
      })
    })

    it('calls trashAsync for a deleted folder', function (done) {
      let doc = {
        _id: 'foobar/baz',
        _rev: '4-1234567890',
        _deleted: true,
        docType: 'folder',
        sides: {
          local: 1,
          remote: 2
        }
      }
      this.local.deleteFolderAsync = sinon.stub()
      this.local.deleteFolderAsync.returnsPromise().resolves()
      this.sync.folderChangedAsync(doc, this.local, 1).then(() => {
        this.local.deleteFolderAsync.calledWith(doc).should.be.true()
        done()
      })
    })

    it('does nothing for a deleted folder that was not added', function (done) {
      let doc = {
        _id: 'tmp/foobaz',
        _rev: '2-1234567890',
        _deleted: true,
        docType: 'folder',
        sides: {
          local: 2
        }
      }
      this.sync.folderChangedAsync(doc, this.remote, 0).then(() => {
        this.remote.trashAsync.called.should.be.false()
        done()
      })
    })
  })

  describe('selectSide', function () {
    beforeEach(function () {
      this.local = {}
      this.remote = {}
      this.ignore = new Ignore([])
      this.events = {}
      this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
    })

    it('selects the local side if remote is up-to-date', function () {
      let doc = {
        _id: 'selectSide/1',
        _rev: '1-0123456789',
        docType: 'file',
        sides: {
          remote: 1
        }
      }
      let [side, name, rev] = this.sync.selectSide(doc)
      side.should.equal(this.sync.local)
      name.should.equal('local')
      rev.should.equal(0)
      doc = {
        _id: 'selectSide/2',
        _rev: '3-0123456789',
        docType: 'file',
        sides: {
          remote: 3,
          local: 2
        }
      };
      [side, name, rev] = this.sync.selectSide(doc)
      side.should.equal(this.sync.local)
      name.should.equal('local')
      rev.should.equal(2)
    })

    it('selects the remote side if local is up-to-date', function () {
      let doc = {
        _id: 'selectSide/3',
        _rev: '1-0123456789',
        docType: 'file',
        sides: {
          local: 1
        }
      }
      let [side, name, rev] = this.sync.selectSide(doc)
      side.should.equal(this.sync.remote)
      name.should.equal('remote')
      rev.should.equal(0)
      doc = {
        _id: 'selectSide/4',
        _rev: '4-0123456789',
        docType: 'file',
        sides: {
          remote: 3,
          local: 4
        }
      };
      [side, name, rev] = this.sync.selectSide(doc)
      side.should.equal(this.sync.remote)
      name.should.equal('remote')
      rev.should.equal(3)
    })

    it('returns an empty array if both sides are up-to-date', function () {
      let doc = {
        _id: 'selectSide/5',
        _rev: '5-0123456789',
        docType: 'file',
        sides: {
          remote: 5,
          local: 5
        }
      }
      let [side, name, rev] = this.sync.selectSide(doc)
      should.not.exist(side)
      should.not.exist(name)
      should.not.exist(rev)
    })
  })

  describe('trashWithParentOrByItself', () => {
    it('should be tested')
  })
})
