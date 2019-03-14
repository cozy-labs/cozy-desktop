/* eslint-env mocha */

const sinon = require('sinon')
const should = require('should')

const { Ignore } = require('../../core/ignore')
const { isUpToDate } = require('../../core/metadata')
const Sync = require('../../core/sync')

const stubSide = require('../support/doubles/side')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

describe('Sync', function () {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  beforeEach('instanciate sync', function () {
    this.local = stubSide()
    this.remote = stubSide()
    this.ignore = new Ignore(['ignored'])
    this.events = {emit: sinon.spy()}
    this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
  })

  describe('start', function () {
    beforeEach('instanciate sync', function () {
      const ret = {
        started: Promise.resolve(),
        running: new Promise(() => {})
      }
      this.local.start = sinon.stub().resolves()
      this.local.stop = sinon.stub().resolves()
      this.remote.start = sinon.stub().returns(ret)
      this.remote.stop = sinon.stub().resolves()
      this.sync.sync = sinon.stub().rejects(new Error('stopped'))
    })

    it('starts the metadata replication of remote in read only', async function () {
      await should(this.sync.start('pull')).be.rejectedWith({message: 'stopped'})
      this.local.start.called.should.be.false()
      this.remote.start.calledOnce.should.be.true()
      this.sync.sync.calledOnce.should.be.true()
    })

    it('starts the metadata replication of local in write only', async function () {
      await should(this.sync.start('push')).be.rejectedWith({message: 'stopped'})
      this.local.start.calledOnce.should.be.true()
      this.remote.start.called.should.be.false()
      this.sync.sync.calledOnce.should.be.true()
    })

    it('starts the metadata replication of both in full', async function () {
      await should(this.sync.start('full')).be.rejectedWith({message: 'stopped'})
      this.local.start.calledOnce.should.be.true()
      this.remote.start.calledOnce.should.be.true()
      this.sync.sync.calledOnce.should.be.true()
    })

    it('does not start sync if metadata replication fails', async function () {
      this.local.start = sinon.stub().rejects(new Error('failed'))
      await should(this.sync.start('full')).be.rejectedWith({message: 'failed'})
      this.local.start.calledOnce.should.be.true()
      this.remote.start.called.should.be.false()
      this.sync.sync.calledOnce.should.be.false()
    })
  })

  // TODO: Test lock request/acquisition/release

  describe('sync', function () {
    it('waits for and applies available changes', async function () {
      const doc1 = {_id: 'doc1', docType: 'file', sides: {local: 1}}
      const doc2 = {_id: 'doc2', docType: 'folder', sides: {remote: 1}}
      await this.pouch.db.put(doc1)
      await this.pouch.db.put(doc2)
      const apply = sinon.stub(this.sync, 'apply')
      apply.callsFake(change => this.pouch.setLocalSeqAsync(change.seq))

      await this.sync.sync()
      should(apply).have.been.calledTwice()
      should(apply.args[0][0].doc).have.properties(doc1)
      should(apply.args[1][0].doc).have.properties(doc2)
    })
  })

  describe('apply', function () {
    it('does nothing for an ignored document', async function () {
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
      await this.sync.apply(change)
      this.sync.folderChanged.called.should.be.false()
    })

    it('does nothing for an up-to-date document', async function () {
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
      await this.sync.apply(change)
      this.sync.folderChanged.called.should.be.false()
    })

    it('trashes a locally deleted file or folder', async function () {
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
      await this.sync.apply(change)
      should(this.sync.trashWithParentOrByItself.called).be.true()
    })

    it('calls fileChanged for a file', async function () {
      let change = {
        seq: 123,
        doc: {
          _id: 'foo/bar',
          docType: 'file',
          md5sum: '0000000000000000000000000000000000000000',
          sides: {
            local: 3,
            remote: 2
          },
          remote: {_id: 'XXX', _rev: '2-abc'}
        }
      }
      await this.sync.apply(change)
      const doc = await this.pouch.db.get(change.doc._id)
      doc.should.have.properties({
        _id: 'foo/bar',
        docType: 'file',
        sides: {
          local: 1,
          remote: 1
        }
      })
    })

    it('calls folderChanged for a folder', async function () {
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
      await this.sync.apply(change)
      const seq = await this.pouch.getLocalSeqAsync()
      seq.should.equal(124)
    })

    it('calls addFileAsync for an added file', async function () {
      let doc = {
        _id: 'foo/bar',
        _rev: '1-abcdef0123456789',
        md5sum: '391f7abfca1124c3ca937e5f85687352bcd9f261',
        docType: 'file',
        sides: {
          local: 1
        }
      }
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.addFileAsync.calledWith(doc).should.be.true()
    })

    it('calls overwriteFileAsync for an overwritten file', async function () {
      let doc = {
        _id: 'overwrite/foo/bar',
        md5sum: '391f7abfca1124c3ca937e5f85687352bcd9f261',
        docType: 'file',
        sides: {
          local: 1
        }
      }
      const created = await this.pouch.db.put(doc)
      doc._rev = created.rev
      doc.md5sum = '389dd709c94a6a7ea56e1d55cbf65eef31b9bc5e'
      doc.sides = {
        local: 2,
        remote: 1
      }
      await this.pouch.db.put(doc)
      await this.sync.applyDoc(doc, this.remote, 'remote', 1)
      this.remote.updateFileMetadataAsync.called.should.be.false()
      this.remote.overwriteFileAsync.calledWith(doc).should.be.true()
    })

    it('calls updateFileMetadataAsync for updated file metadata', async function () {
      let doc = {
        _id: 'update/foo/bar',
        md5sum: '391f7abfca1124c3ca937e5f85687352bcd9f261',
        docType: 'file',
        sides: {
          local: 1
        }
      }
      const created = await this.pouch.db.put(doc)
      doc._rev = created.rev
      doc.tags = ['courge']
      doc.sides = {
        local: 2,
        remote: 1
      }
      await this.pouch.db.put(doc)
      await this.sync.applyDoc(doc, this.remote, 'remote', 1)
      this.remote.overwriteFileAsync.called.should.be.false()
      let ufm = this.remote.updateFileMetadataAsync
      ufm.calledWith(doc).should.be.true()
    })

    it('calls moveFileAsync for a moved file', async function () {
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
        moveFrom: was,
        docType: 'file',
        tags: ['qux'],
        sides: {
          local: 1
        }
      }
      await this.sync.applyDoc(was, this.remote, 'remote', 2)
      this.remote.trashAsync.called.should.be.false()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.addFileAsync.called.should.be.false()
      this.remote.moveFileAsync.calledWith(doc, was).should.be.true()
    })

    it('calls moveFileAsync and overwriteFileAsync for a moved-updated file', async function () {
      let was = {
        _id: 'foo/bar',
        _rev: '3-9876543210',
        _deleted: true,
        moveTo: 'foo/baz',
        md5sum: 'wasMD5',
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
        moveFrom: was,
        md5sum: 'newMD5',
        docType: 'file',
        tags: ['qux'],
        sides: {
          local: 1
        }
      }
      await this.sync.applyDoc(was, this.remote, 'remote', 2)
      this.remote.trashAsync.called.should.be.false()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.addFileAsync.called.should.be.false()
      this.remote.moveFileAsync.calledWith(doc, was).should.be.true()
      this.remote.overwriteFileAsync.calledWith(doc).should.be.true()
    })

    it('does not break when move works but not update', async function () {
      let was = {
        _id: 'foo/bar2',
        _deleted: true,
        moveTo: 'foo/baz',
        md5sum: 'wasMD5',
        docType: 'file',
        tags: ['qux'],
        sides: {
          local: 3,
          remote: 2
        }
      }
      let doc = {
        _id: 'foo/baz2',
        moveFrom: was,
        md5sum: 'newMD5',
        docType: 'file',
        tags: ['qux'],
        sides: {
          local: 1
        }
      }
      was._rev = (await this.pouch.db.put(was)).rev
      doc._rev = (await this.pouch.db.put(doc)).rev

      // re-stubs overwriteFileAsync to fail
      this.remote.overwriteFileAsync = sinon.stub().rejects(new Error('bad md5sum mock'))
      this.sync.diskUsage = sinon.stub().resolves()

      await this.sync.apply({doc: doc}, this.remote, 'remote', 0)

      this.remote.addFileAsync.called.should.be.false()
      this.remote.trashAsync.called.should.be.false()
      this.remote.moveFileAsync.calledWith(doc, was).should.be.true()
      this.remote.overwriteFileAsync.calledWith(doc).should.be.true()

      const newMetadata = await this.pouch.db.get('foo/baz2')
      should(newMetadata).not.have.property('moveFrom')
      should(newMetadata).have.property('errors')

      // restore
      this.remote.overwriteFileAsync = sinon.stub().resolves()
    })

    it('calls trashAsync for a deleted file', async function () {
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
      await this.sync.applyDoc(doc, this.local, 'local', 1)
      this.local.trashAsync.calledWith(doc).should.be.true()
    })

    it('does nothing for a deleted file that was not added', async function () {
      let doc = {
        _id: 'tmp/fooz',
        _rev: '2-1234567890',
        _deleted: true,
        docType: 'file',
        sides: {
          local: 2
        }
      }
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.trashAsync.called.should.be.false()
    })

    it('calls addFolderAsync for an added folder', async function () {
      let doc = {
        _id: 'foobar/bar',
        _rev: '1-abcdef0123456789',
        docType: 'folder',
        sides: {
          local: 1
        }
      }
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.addFolderAsync.calledWith(doc).should.be.true()
    })

    xit('calls updateFolderAsync for an updated folder', async function () {
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
      await this.sync.applyDoc(doc, this.local, 'local', 1)
      this.local.updateFolderAsync.calledWith(doc).should.be.true()
    })

    it('calls moveFolderAsync for a moved folder', async function () {
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
        moveFrom: was,
        docType: 'folder',
        tags: ['qux'],
        sides: {
          local: 1
        }
      }
      await this.sync.applyDoc(was, this.remote, 'remote', 2)
      this.remote.trashAsync.called.should.be.false()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.addFolderAsync.called.should.be.false()
      this.remote.moveFolderAsync.calledWith(doc, was).should.be.true()
    })

    it('calls trashAsync for a deleted folder', async function () {
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
      await this.sync.applyDoc(doc, this.local, 'local', 1)
      this.local.deleteFolderAsync.calledWith(doc).should.be.true()
    })

    it('does nothing for a deleted folder that was not added', async function () {
      let doc = {
        _id: 'tmp/foobaz',
        _rev: '2-1234567890',
        _deleted: true,
        docType: 'folder',
        sides: {
          local: 2
        }
      }
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.trashAsync.called.should.be.false()
    })
  })

  describe('updateErrors', function () {
    it('retries on first local -> remote sync error', async function () {
      let doc = {
        _id: 'first/failure',
        sides: {
          local: 1
        }
      }
      const infos = await this.pouch.db.put(doc)
      doc._rev = infos.rev

      await this.sync.updateErrors({doc}, 'remote')

      const actual = await this.pouch.db.get(doc._id)
      should(actual.errors).equal(1)
      should(actual._rev).not.equal(doc._rev)
      should(actual.sides).deepEqual({local: 2})
      should(isUpToDate('local', actual)).be.true()
    })

    it('retries on second remote -> local sync error', async function () {
      let doc = {
        _id: 'second/failure',
        errors: 1,
        sides: {
          // XXX: Use dumb values so we don't need to save Pouch doc multiple
          //      times to get a matching rev.
          local: 0,
          remote: 2
        }
      }
      let infos = await this.pouch.db.put(doc)
      doc._rev = infos.rev
      infos = await this.pouch.db.put(doc)
      doc._rev = infos.rev

      await this.sync.updateErrors({doc}, 'local')

      const actual = await this.pouch.db.get(doc._id)
      should(actual.errors).equal(2)
      should(actual._rev).not.equal(doc._rev)
      should(actual.sides).deepEqual({local: 0, remote: 3})
      should(isUpToDate('remote', actual)).be.true()
    })

    it('stops retrying after 3 errors', async function () {
      let doc = {
        _id: 'third/failure',
        errors: 3,
        sides: {
          remote: 1
        }
      }
      const infos = await this.pouch.db.put(doc)
      doc._rev = infos.rev
      await this.sync.updateErrors({doc}, 'local')
      const actual = await this.pouch.db.get(doc._id)
      actual.errors.should.equal(3)
      actual._rev.should.equal(doc._rev)
      should(isUpToDate('remote', actual)).be.true()
    })
  })

  describe('selectSide', function () {
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

    it('returns an empty array if a local only doc is deleted', function () {
      let doc = {
        _id: 'selectSide/5',
        _rev: '5-0123456789',
        _deleted: true,
        docType: 'file',
        sides: {
          local: 5
        }
      }
      let [side, name, rev] = this.sync.selectSide(doc)
      should.not.exist(side)
      should.not.exist(name)
      should.not.exist(rev)
    })

    it('returns an empty array if a remote only doc is deleted', function () {
      let doc = {
        _id: 'selectSide/5',
        _rev: '5-0123456789',
        _deleted: true,
        docType: 'file',
        sides: {
          remote: 5
        }
      }
      let [side, name, rev] = this.sync.selectSide(doc)
      should.not.exist(side)
      should.not.exist(name)
      should.not.exist(rev)
    })
  })
})
