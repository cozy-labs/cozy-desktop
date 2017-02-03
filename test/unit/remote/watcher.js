/* @flow */
/* eslint-env mocha */

import async from 'async'
import clone from 'lodash.clone'
import sinon from 'sinon'
import should from 'should'

import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'
import { COZY_URL } from '../../helpers/integration'

import { FILES_DOCTYPE } from '../../../src/remote/constants'
import Prep from '../../../src/prep'
import RemoteCozy from '../../../src/remote/cozy'
import RemoteWatcher from '../../../src/remote/watcher'

import type { RemoteDoc } from '../../../src/remote/document'
import type { Metadata } from '../../../src/metadata'

describe('RemoteWatcher', function () {
  before(configHelpers.createConfig)
  before(pouchHelpers.createDatabase)
  before(function instanciateRemoteWatcher () {
    this.prep = {invalidPath: Prep.prototype.invalidPath}
    this.remoteCozy = new RemoteCozy(COZY_URL)
    this.watcher = new RemoteWatcher(this.pouch, this.prep, this.remoteCozy)
  })
  after(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  before(function (done) {
    // TODO: promisify pouchHelpers
    pouchHelpers.createParentFolder(this.pouch, () => {
      async.eachSeries([1, 2, 3], (i, callback) => {
        pouchHelpers.createFolder(this.pouch, i, () => {
          pouchHelpers.createFile(this.pouch, i, callback)
        })
      }, done)
    })
  })

  describe('pullMany', function () {
    const ids = [
      'cb62b7873e1e7f5d7c6946d38f0039eb',
      '7c72ebd6ae3c13892a9cfcf4b500664f'
    ]
    let pullOne

    beforeEach(function () {
      pullOne = sinon.stub(this.watcher, 'pullOne')
    })

    afterEach(function () {
      pullOne.restore()
    })

    it('pulls many changed files/dirs given their ids', async function () {
      pullOne.returnsPromise().resolves()

      await this.watcher.pullMany(ids)

      pullOne.callCount.should.equal(2)
      pullOne.calledWith(ids[0]).should.equal(true)
      pullOne.calledWith(ids[1]).should.equal(true)
    })

    context('when pullOne() rejects some file/dir', function () {
      beforeEach(function () {
        pullOne.withArgs(ids[0]).returnsPromise().rejects()
        pullOne.withArgs(ids[1]).returnsPromise().resolves()
      })

      it('rejects with the failed ids', function () {
        return this.watcher.pullMany(ids)
          .should.be.rejectedWith(new RegExp(ids[0]))
      })

      it('still tries to pull other files/dirs', async function () {
        try { await this.watcher.pullMany(ids) } catch (_) {}
        pullOne.calledWith(ids[1]).should.equal(true)
      })
    })
  })

  describe('pullOne', function () {
    let onChange, findMaybe

    beforeEach(function () {
      onChange = sinon.stub(this.watcher, 'onChange')
      findMaybe = sinon.stub(this.remoteCozy, 'findMaybe')
    })

    afterEach(function () {
      onChange.restore()
      findMaybe.restore()
    })

    it('applies the changes when the document still exists on remote', async function () {
      let doc: RemoteDoc = {
        _id: '12345678904',
        _rev: '1-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        name: 'whatever',
        created_at: '2017-01-30T09:09:15.217662611+01:00',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        tags: [],
        binary: {
          file: {
            id: '123'
          }
        }
      }
      findMaybe.withArgs(doc._id).returnsPromise().resolves(doc)

      await this.watcher.pullOne(doc._id)

      onChange.calledWith(doc).should.equal(true)
    })

    it('does nothing otherwise', async function () {
      const id = 'missing'
      findMaybe.withArgs(id).returnsPromise().resolves(null)

      await this.watcher.pullOne(id)

      onChange.calledOnce.should.equal(false)
    })
  })

  describe('onChange', function () {
    it('does not fail when the path is missing', function () {
      let doc: RemoteDoc = {
        _id: '12345678904',
        _rev: '1-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        name: 'whatever',
        created_at: '2017-01-30T09:09:15.217662611+01:00',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        tags: [],
        binary: {
          file: {
            id: '123'
          }
        }
      }

      return this.watcher.onChange(doc)
        .should.be.rejectedWith({message: 'Invalid path/name'})
    })

    it('does not fail on ghost file', async function () {
      sinon.stub(this.watcher, 'putDoc')
      let doc = {
        _id: '12345678904',
        _rev: '1-abcdef',
        docType: 'file',
        path: 'foo',
        name: 'bar'
      }
      await this.watcher.onChange(doc)

      this.watcher.putDoc.called.should.be.false()
      this.watcher.putDoc.restore()
    })

    it('calls addDoc for a new doc', async function () {
      this.prep.addDocAsync = sinon.stub()
      this.prep.addDocAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '12345678905',
        _rev: '1-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: '23456789012',
        path: 'my-folder',
        name: 'file-5',
        md5sum: '9999999999999999999999999999999999999999',
        tags: [],
        created_at: '2017-01-30T09:09:15.217662611+01:00',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        binary: {
          file: {
            id: '1234',
            rev: '5-6789'
          }
        }
      }

      await this.watcher.onChange(clone(doc))

      this.prep.addDocAsync.called.should.be.true()
      let args = this.prep.addDocAsync.args[0]
      args[0].should.equal('remote')
      args[1].should.have.properties({
        path: doc.path,
        docType: 'file',
        checksum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      args[1].should.not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls updateDoc when tags are updated', async function () {
      this.prep.updateDocAsync = sinon.stub()
      this.prep.updateDocAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '12345678901',
        _rev: '2-abcdef',
        _type: FILES_DOCTYPE,
        dir_id: '23456789012',
        type: 'file',
        path: 'my-folder/file-1',
        name: 'file-1',
        md5sum: '1111111111111111111111111111111111111111',
        tags: ['foo', 'bar', 'baz'],
        created_at: '2017-01-30T09:09:15.217662611+01:00',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        binary: {
          file: {
            id: '1234',
            rev: '5-6789'
          }
        }
      }

      await this.watcher.onChange(clone(doc))

      this.prep.updateDocAsync.called.should.be.true()
      let args = this.prep.updateDocAsync.args[0]
      args[0].should.equal('remote')
      args[1].should.have.properties({
        path: doc.path,
        docType: 'file',
        checksum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      args[1].should.not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls updateDoc when content is overwritten', async function () {
      this.prep.updateDocAsync = sinon.stub()
      this.prep.updateDocAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '12345678901',
        _rev: '3-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        path: 'my-folder/file-1',
        name: 'file-1',
        md5sum: '9999999999999999999999999999999999999999',
        created_at: '2017-01-30T09:09:15.217662611+01:00',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        tags: ['foo', 'bar', 'baz']
      }

      await this.watcher.onChange(clone(doc))

      this.prep.updateDocAsync.called.should.be.true()
      let args = this.prep.updateDocAsync.args[0]
      args[0].should.equal('remote')
      args[1].should.have.properties({
        path: 'my-folder/file-1',
        docType: 'file',
        checksum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      args[1].should.not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveDoc when file is renamed', async function () {
      this.prep.moveDocAsync = sinon.stub()
      this.prep.moveDocAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '12345678902',
        _rev: '4-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        path: 'my-folder',
        name: 'file-2-bis',
        md5sum: '1111111111111111111111111111111111111112',
        tags: [],
        created_at: '2017-01-30T09:09:15.217662611+01:00',
        updated_at: '2017-01-30T09:09:15.217662611+01:00'
      }

      await this.watcher.onChange(clone(doc))

      this.prep.moveDocAsync.called.should.be.true()
      let args = this.prep.moveDocAsync.args[0]
      args[0].should.equal('remote')
      let src = args[2]
      src.should.have.properties({
        path: 'my-folder/file-2',
        docType: 'file',
        checksum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: '12345678902'
        }
      })
      let dst = args[1]
      dst.should.have.properties({
        path: doc.path,
        docType: 'file',
        checksum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      dst.should.not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveDoc when file is moved', async function () {
      this.prep.moveDocAsync = sinon.stub()
      this.prep.moveDocAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '12345678902',
        _rev: '5-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        path: 'another-folder/in/some/place',
        name: 'file-2-ter',
        md5sum: '1111111111111111111111111111111111111112',
        tags: [],
        created_at: '2017-01-30T09:09:15.217662611+01:00',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        binary: {
          file: {
            id: '4321',
            rev: '9-8765'
          }
        }
      }

      await this.watcher.onChange(clone(doc))

      this.prep.moveDocAsync.called.should.be.true()
      let src = this.prep.moveDocAsync.args[0][2]
      src.should.have.properties({
        path: 'my-folder/file-2',
        docType: 'file',
        checksum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: '12345678902'
        }
      })
      let dst = this.prep.moveDocAsync.args[0][1]
      dst.should.have.properties({
        path: doc.path,
        docType: 'file',
        checksum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      dst.should.not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls deleteDoc & addDoc when file has changed completely', async function () {
      this.prep.deleteDocAsync = sinon.stub()
      this.prep.addDocAsync = sinon.stub()
      this.prep.deleteDocAsync.returnsPromise().resolves(null)
      this.prep.addDocAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '12345678903',
        _rev: '6-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        path: 'another-folder/in/some/place',
        name: 'file-3-bis',
        md5sum: '8888888888888888888888888888888888888888',
        tags: [],
        created_at: '2017-01-30T09:09:15.217662611+01:00',
        updated_at: '2017-01-30T09:09:15.217662611+01:00'
      }
      let was: Metadata = await this.pouch.db.get('my-folder/file-3')
      was.remote._rev = doc._rev
      await this.pouch.db.put(was)

      await this.watcher.onChange(clone(doc))

      this.prep.deleteDocAsync.called.should.be.true()
      let id = this.prep.deleteDocAsync.args[0][1].path
      id.should.equal('my-folder/file-3')
      this.prep.addDocAsync.called.should.be.true()
      let args = this.prep.addDocAsync.args[0]
      args[0].should.equal('remote')
      args[1].should.have.properties({
        path: doc.path,
        docType: 'file',
        checksum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      args[1].should.not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls deleteDoc for a doc put in the trash', async function () {
      this.prep.deleteDocAsync = sinon.stub()
      this.prep.deleteDocAsync.returnsPromise().resolves(null)
      let doc = {
        _id: '12345678901',
        _rev: '7-abcdef',
        path: '/.cozy_trash/foo'
      }

      await this.watcher.onChange(doc)

      this.prep.deleteDocAsync.called.should.be.true()
      let id = this.prep.deleteDocAsync.args[0][1].path
      id.should.equal('my-folder/file-1')
    })

    it('calls addDoc for folder created by the mobile app', async function () {
      this.prep.addDocAsync = sinon.stub()
      this.prep.addDocAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '913F429E-5609-C636-AE9A-CD00BD138B13',
        _rev: '1-7786acf12a11fad6ad1eeb861953e0d8',
        _type: FILES_DOCTYPE,
        type: 'directory',
        name: 'Photos from devices',
        dir_id: 'whatever',
        path: '/Photos from devices',
        created_at: '2015-09-29T14:13:33.384Z',
        updated_at: '2015-09-29T14:13:33.384Z',
        tags: []
      }

      await this.watcher.onChange(doc)

      this.prep.addDocAsync.called.should.be.true()
      this.prep.addDocAsync.args[0][1].should.have.properties({
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
    })
  })

  describe('removeRemote', function () {
    it('remove the association between a document and its remote', async function () {
      let doc: Metadata = {
        _id: 'removeRemote',
        path: 'removeRemote',
        docType: 'file',
        checksum: 'd3e2163ccd0c497969233a6bd2a4ac843fb8165e',
        creationDate: '2015-09-29T14:13:33.384Z',
        lastModification: '2015-09-29T14:13:33.384Z',
        tags: [],
        remote: {
          _id: '913F429E-5609-C636-AE9A-CD00BD138B13',
          _rev: '1-7786acf12a11fad6ad1eeb861953e0d8'
        },
        sides: {
          local: '2',
          remote: '1'
        }
      }
      await this.pouch.db.put(doc)
      const was = await this.pouch.db.get(doc._id)

      await this.watcher.removeRemote(was)

      const actual = await this.pouch.db.get(doc._id)
      should.not.exist(actual.sides.remote)
      should.not.exist(actual.remote)
      actual._id.should.equal(doc._id)
      actual.sides.local.should.equal('2')
    })
  })
})
