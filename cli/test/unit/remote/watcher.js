/* @flow */
/* eslint-env mocha */

import async from 'async'
import EventEmitter from 'events'
import clone from 'lodash.clone'
import path from 'path'
import sinon from 'sinon'
import should from 'should'
import { Client as CozyClient } from 'cozy-client-js'

import pouchdbBuilders from '../../builders/pouchdb'
import configHelpers from '../../helpers/config'
import { onPlatform } from '../../helpers/platform'
import pouchHelpers from '../../helpers/pouch'
import { builders } from '../../helpers/cozy'

import { createMetadata } from '../../../src/conversion'
import { buildId } from '../../../src/metadata'
import { FILES_DOCTYPE, ROOT_DIR_ID, TRASH_DIR_ID } from '../../../src/remote/constants'
import Prep from '../../../src/prep'
import RemoteCozy from '../../../src/remote/cozy'
import RemoteWatcher from '../../../src/remote/watcher'

import type { RemoteDoc, RemoteDeletion } from '../../../src/remote/document'
import type { Metadata } from '../../../src/metadata'

describe('RemoteWatcher', function () {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before(pouchHelpers.createDatabase)
  before(function instanciateRemoteWatcher () {
    this.prep = sinon.createStubInstance(Prep)
    this.prep.config = this.config
    this.remoteCozy = new RemoteCozy(this.config)
    this.remoteCozy.client = new CozyClient({
      cozyUrl: this.config.cozyUrl,
      token: process.env.COZY_STACK_TOKEN
    })
    this.events = new EventEmitter()
    this.watcher = new RemoteWatcher(this.pouch, this.prep, this.remoteCozy, this.events)
  })
  afterEach(function removeEventListeners () {
    this.events.removeAllListeners()
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

  describe('start', function () {
    beforeEach(function () {
      sinon.stub(this.watcher, 'watch').returns(Promise.resolve())
      return this.watcher.start()
    })

    afterEach(function () {
      this.watcher.watch.restore()
    })

    it('calls watch() a first time', function () {
      this.watcher.watch.callCount.should.equal(1)
    })
  })

  describe('stop', function () {
    beforeEach(function () {
      sinon.stub(this.watcher, 'watch').returns(Promise.resolve())
    })

    afterEach(function () {
      this.watcher.watch.restore()
    })

    it('ensures watch is not called anymore', function () {
      this.watcher.start()
      should(this.watcher.intervalID).not.be.null()
      this.watcher.stop()
      should(this.watcher.intervalID).be.null()
    })

    it('does nothing when called again', function () {
      this.watcher.start()
      this.watcher.stop()
      this.watcher.stop()
    })
  })

  describe('watch', function () {
    const lastLocalSeq = '123'
    const lastRemoteSeq = lastLocalSeq + '456'
    const changes = {
      last_seq: lastRemoteSeq,
      docs: [
        builders.remoteFile().build(),
        builders.remoteDir().build()
      ]
    }

    beforeEach(function () {
      sinon.stub(this.pouch, 'getRemoteSeqAsync')
      sinon.stub(this.pouch, 'setRemoteSeqAsync')
      sinon.stub(this.watcher, 'pullMany')
      sinon.stub(this.remoteCozy, 'changes')

      this.pouch.getRemoteSeqAsync.returnsPromise().resolves(lastLocalSeq)
      this.watcher.pullMany.returnsPromise().resolves()
      this.remoteCozy.changes.returnsPromise().resolves(changes)

      return this.watcher.watch()
    })

    afterEach(function () {
      this.remoteCozy.changes.restore()
      this.watcher.pullMany.restore()
      this.pouch.setRemoteSeqAsync.restore()
      this.pouch.getRemoteSeqAsync.restore()
    })

    it('pulls the changed files/dirs', function () {
      this.watcher.pullMany.should.be.calledOnce()
        .and.be.calledWithExactly(changes.docs)
    })

    it('updates the last update sequence in local db', function () {
      this.pouch.setRemoteSeqAsync.should.be.calledOnce()
        .and.be.calledWithExactly(lastRemoteSeq)
    })
  })

  describe('pullMany', function () {
    const changes = [
      builders.remoteFile().build(),
      {_id: pouchdbBuilders.id(), _rev: pouchdbBuilders.rev(), _deleted: true}
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

      await this.watcher.pullMany(changes)

      pullOne.callCount.should.equal(2)
      pullOne.calledWith(changes[0]).should.equal(true)
      pullOne.calledWith(changes[1]).should.equal(true)
    })

    context('when pullOne() rejects some file/dir', function () {
      beforeEach(function () {
        pullOne.withArgs(changes[0]).returnsPromise().rejects(new Error('oops'))
        pullOne.withArgs(changes[1]).returnsPromise().resolves()
      })

      it('rejects with the failed ids', function () {
        return this.watcher.pullMany(changes)
          .should.be.rejectedWith(new RegExp(changes[0]._id))
      })

      it('still tries to this.watcher other files/dirs', async function () {
        try { await this.watcher.pullMany(changes) } catch (_) {}
        pullOne.calledWith(changes[1]).should.equal(true)
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
        path: '/whatever',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        tags: [],
        binary: {
          file: {
            id: '123'
          }
        }
      }

      await this.watcher.pullOne(doc)

      should(onChange.calledOnce).be.true()
      should(onChange.args[0][0]).deepEqual(doc)
    })

    it('tries to apply a deletion otherwise', async function () {
      const doc: RemoteDeletion = {
        _id: 'missing',
        _rev: 'whatever',
        _deleted: true
      }

      await this.watcher.pullOne(doc)

      should(onChange.calledOnce).be.true()
      should(onChange.args[0][0]).deepEqual(doc)
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
        path: '',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        tags: [],
        binary: {
          file: {
            id: '123'
          }
        }
      }

      return this.watcher.onChange(doc)
        .should.be.rejectedWith({message: 'Invalid path'})
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

    onPlatform('win32', () => {
      it('emits path/platform incompatibilities if any', async function () {
        const doc = {
          _id: 'whatever',
          path: '/f:oo/b<a>r',
          type: 'file'
        }
        const incompatibilitiesPromise = new Promise((resolve) => {
          this.events.on('platform-incompatibilities', resolve)
        })
        this.watcher.onChange(doc)
        const incompatibilities = await incompatibilitiesPromise
        const platform = process.platform
        should(incompatibilities).deepEqual([
          {
            type: 'reservedChars',
            name: 'b<a>r',
            path: 'f:oo\\b<a>r',
            docType: 'file',
            reservedChars: new Set('<>'),
            platform
          },
          {
            type: 'reservedChars',
            name: 'f:oo',
            path: 'f:oo',
            docType: 'folder',
            reservedChars: new Set(':'),
            platform
          }
        ])
      })

      it('does not emit when file/dir is in the trash', async function () {
        this.events.on('platform-incompatibilities', should.not.exist)
        await this.watcher.onChange({
          _id: 'whatever',
          path: '/.cozy_trash/f:oo/b<a>r',
          type: 'file'
        })
      })
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
        path: '/my-folder',
        name: 'file-5',
        md5sum: '9999999999999999999999999999999999999999',
        tags: [],
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
        path: 'my-folder',
        docType: 'file',
        md5sum: doc.md5sum,
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
        path: '/my-folder/file-1',
        name: 'file-1',
        md5sum: '1111111111111111111111111111111111111111',
        tags: ['foo', 'bar', 'baz'],
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        binary: {
          file: {
            id: '1234',
            rev: '5-6789'
          }
        }
      }
      const was = await this.pouch.byRemoteIdAsync(doc._id)

      await this.watcher.onChange(clone(doc), was)

      this.prep.updateDocAsync.called.should.be.true()
      let args = this.prep.updateDocAsync.args[0]
      args[0].should.equal('remote')
      args[1].should.have.properties({
        path: path.normalize('my-folder/file-1'),
        docType: 'file',
        md5sum: doc.md5sum,
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
        path: '/my-folder/file-1',
        name: 'file-1',
        md5sum: '9999999999999999999999999999999999999999',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        tags: ['foo', 'bar', 'baz']
      }
      const was = await this.pouch.byRemoteIdAsync(doc._id)

      await this.watcher.onChange(clone(doc), was)

      this.prep.updateDocAsync.called.should.be.true()
      let args = this.prep.updateDocAsync.args[0]
      args[0].should.equal('remote')
      args[1].should.have.properties({
        path: path.normalize('my-folder/file-1'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      args[1].should.not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveFile when file is renamed', async function () {
      this.prep.moveFileAsync = sinon.stub()
      this.prep.moveFileAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '12345678902',
        _rev: '4-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        path: '/my-folder',
        name: 'file-2-bis',
        md5sum: '1111111111111111111111111111111111111112',
        tags: [],
        updated_at: '2017-01-30T09:09:15.217662611+01:00'
      }

      const was = await this.pouch.byRemoteIdMaybeAsync(doc._id)
      await this.watcher.onChange(clone(doc), was)

      this.prep.moveFileAsync.called.should.be.true()
      let args = this.prep.moveFileAsync.args[0]
      args[0].should.equal('remote')
      let src = args[2]
      src.should.have.properties({
        path: path.normalize('my-folder/file-2'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: '12345678902'
        }
      })
      let dst = args[1]
      dst.should.have.properties({
        path: 'my-folder',
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      dst.should.not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveFile when file is moved', async function () {
      this.prep.moveFileAsync = sinon.stub()
      this.prep.moveFileAsync.returnsPromise().resolves(null)
      let doc: RemoteDoc = {
        _id: '12345678902',
        _rev: '5-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        path: '/another-folder/in/some/place',
        name: 'file-2-ter',
        md5sum: '1111111111111111111111111111111111111112',
        tags: [],
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        binary: {
          file: {
            id: '4321',
            rev: '9-8765'
          }
        }
      }
      const was: Metadata = await this.pouch.db.get(path.normalize('my-folder/file-2'))
      await this.pouch.db.put(was)

      await this.watcher.onChange(clone(doc), was)

      this.prep.moveFileAsync.called.should.be.true()
      let src = this.prep.moveFileAsync.args[0][2]
      src.should.have.properties({
        path: path.normalize('my-folder/file-2'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: '12345678902'
        }
      })
      let dst = this.prep.moveFileAsync.args[0][1]
      dst.should.have.properties({
        path: path.normalize('another-folder/in/some/place'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      dst.should.not.have.properties(['_rev', 'path', 'name'])
    })

    xit('calls deleteDoc & addDoc when trashed', async function () {
      this.prep.deleteDocAsync = sinon.stub()
      this.prep.deleteDocAsync.returnsPromise().resolves(null)
      this.prep.addDocAsync = sinon.stub()
      this.prep.addDocAsync.returnsPromise().resolves(null)
      const oldDir: RemoteDoc = builders.remoteDir().named('foo').build()
      // TODO: builders.dirMetadata().fromRemote(oldDir).create()
      let oldMeta: Metadata = createMetadata(oldDir)
      buildId(oldMeta)
      await this.pouch.db.put(oldMeta)
      // TODO: builders.remoteDir().was(oldDir).trashed().build()
      const newDir: RemoteDoc = {...oldDir, path: '/.cozy_trash/foo', dir_id: TRASH_DIR_ID}

      await this.watcher.onChange(newDir)

      should(this.prep.deleteDocAsync.called).be.true()
      should(this.prep.addDocAsync.called).be.true()
      const deleteArgs = this.prep.deleteDocAsync.args[0]
      // FIXME: Make sure oldMeta timestamps are formatted as expected by PouchDB
      delete oldMeta.updated_at
      should(deleteArgs[0]).equal('remote')
      should(deleteArgs[1]).have.properties(oldMeta)
      const addArgs = this.prep.addDocAsync.args[0]
      should(addArgs[0]).equal('remote')
      should(addArgs[1]).have.properties(createMetadata(newDir))
    })

    xit('calls deleteDoc & addDoc when restored', async function () {
      this.prep.deleteDocAsync = sinon.stub()
      this.prep.deleteDocAsync.returnsPromise().resolves(null)
      this.prep.addDocAsync = sinon.stub()
      this.prep.addDocAsync.returnsPromise().resolves(null)
      const oldDir: RemoteDoc = builders.remoteDir().named('foo').trashed().build()
      // TODO: builders.dirMetadata().fromRemote(oldDir).create()
      let oldMeta: Metadata = createMetadata(oldDir)
      buildId(oldMeta)
      await this.pouch.db.put(oldMeta)
      // TODO: builders.remoteDir().was(oldDir).restored().build()
      const newDir: RemoteDoc = {...oldDir, path: '/foo', dir_id: ROOT_DIR_ID}

      await this.watcher.onChange(newDir)

      should(this.prep.deleteDocAsync.called).be.true()
      should(this.prep.addDocAsync.called).be.true()
      const deleteArgs = this.prep.deleteDocAsync.args[0]
      // FIXME: Make sure oldMeta timestamps are formatted as expected by PouchDB
      delete oldMeta.updated_at
      should(deleteArgs[0]).equal('remote')
      should(deleteArgs[1]).have.properties(oldMeta)
      const addArgs = this.prep.addDocAsync.args[0]
      should(addArgs[0]).equal('remote')
      should(addArgs[1]).have.properties(createMetadata(newDir))
    })
  })

  describe('removeRemote', function () {
    it('remove the association between a document and its remote', async function () {
      let doc = {
        _id: 'removeRemote',
        path: 'removeRemote',
        docType: 'file',
        md5sum: 'd3e2163ccd0c497969233a6bd2a4ac843fb8165e',
        updated_at: '2015-09-29T14:13:33.384Z',
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
