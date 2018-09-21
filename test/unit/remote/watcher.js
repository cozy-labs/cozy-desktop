/* @flow */
/* eslint-env mocha */

const EventEmitter = require('events')
const _ = require('lodash')
const path = require('path')
const sinon = require('sinon')
const should = require('should')
const uuid = require('uuid/v4')
const CozyClient = require('cozy-client-js').Client

const dbBuilders = require('../../support/builders/db')
const configHelpers = require('../../support/helpers/config')
const { posixifyPath } = require('../../support/helpers/context_dir')
const { onPlatform } = require('../../support/helpers/platform')
const pouchHelpers = require('../../support/helpers/pouch')
const { builders } = require('../../support/helpers/cozy')

const { createMetadata } = require('../../../core/conversion')
const metadata = require('../../../core/metadata')
const {
  FILES_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  TRASH_DIR_NAME
} = require('../../../core/remote/constants')
const Prep = require('../../../core/prep')
const { RemoteCozy } = require('../../../core/remote/cozy')
const { RemoteWatcher } = require('../../../core/remote/watcher')

const { assignId, ensureValidPath } = metadata

/*::
import type { RemoteChange } from '../../../core/remote/change'
import type { RemoteDoc, RemoteDeletion } from '../../../core/remote/document'
import type { Metadata } from '../../../core/metadata'
*/

describe('RemoteWatcher', function () {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before(pouchHelpers.createDatabase)
  before(function instanciateRemoteWatcher () {
    this.prep = sinon.createStubInstance(Prep)
    this.prep.config = this.config
    this.remoteCozy = new RemoteCozy(this.config)
    this.remoteCozy.client = new CozyClient({
      cozyURL: this.config.cozyUrl,
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

  before(async function () {
    await pouchHelpers.createParentFolder(this.pouch)
    // FIXME: Tests pass without folder 3 & file 3
    for (let i of [1, 2, 3]) {
      await pouchHelpers.createFolder(this.pouch, i)
      await pouchHelpers.createFile(this.pouch, i)
    }
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
      should(this.watcher.runningResolve).not.be.null()
      this.watcher.stop()
      should(this.watcher.runningResolve).be.null()
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
        builders.remote.file().build(),
        builders.remote.dir().build()
      ]
    }

    beforeEach(function () {
      sinon.stub(this.pouch, 'getRemoteSeqAsync')
      sinon.stub(this.pouch, 'setRemoteSeqAsync')
      sinon.stub(this.watcher, 'pullMany')
      sinon.stub(this.remoteCozy, 'changes')

      this.pouch.getRemoteSeqAsync.resolves(lastLocalSeq)
      this.watcher.pullMany.resolves()
      this.remoteCozy.changes.resolves(changes)

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

  const validMetadata = (doc /*: RemoteDoc */) /*: Metadata */ => {
    const metadata = createMetadata(doc)
    ensureValidPath(metadata)
    assignId(metadata)
    return metadata
  }

  describe('pullMany', function () {
    const docs = [
      builders.remote.file().build(),
      {_id: dbBuilders.id(), _rev: dbBuilders.rev(), _deleted: true}
    ]
    let apply
    let findMaybe

    beforeEach(function () {
      apply = sinon.stub(this.watcher, 'apply')
      findMaybe = sinon.stub(this.remoteCozy, 'findMaybe')
    })

    afterEach(function () {
      apply.restore()
      findMaybe.restore()
    })

    it('pulls many changed files/dirs given their ids', async function () {
      apply.resolves()

      await this.watcher.pullMany(docs)

      apply.callCount.should.equal(2)
      // Changes are sorted before applying (first one was given
      // Metadata since it is valid, while second one got the original
      // RemoteDeletion)
      should(apply.args[0][0].doc).deepEqual(validMetadata(docs[0]))
      should(apply.args[1][0].doc).deepEqual(docs[1])
    })

    context('when apply() rejects some file/dir', function () {
      beforeEach(function () {
        apply.callsFake(async (change /*: RemoteChange */) /*: Promise<void> */ => {
          if (change.type === 'FileAddition') throw new Error('oops')
        })
      })

      it('rejects with the failed ids', function () {
        return this.watcher.pullMany(docs)
          .should.be.rejectedWith(new RegExp(docs[0]._id))
      })

      it('still tries to pull other files/dirs', async function () {
        try { await this.watcher.pullMany(docs) } catch (_) {}
        should(apply).have.been.calledTwice()
        should(apply.args[0][0]).have.properties({type: 'FileAddition', doc: validMetadata(docs[0])})
        should(apply.args[1][0]).have.properties({type: 'RemoteIgnoredChange', doc: docs[1]})
      })

      it('releases the Pouch lock', async function () {
        try { await this.watcher.pullMany(docs) } catch (_) {}
        const nextLockPromise = this.pouch.lock('nextLock')
        await should(nextLockPromise).be.fulfilled()
      })
    })

    it('applies the changes when the document still exists on remote', async function () {
      let doc /*: RemoteDoc */ = {
        _id: '12345678904',
        _rev: '1-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        name: 'whatever',
        path: '/whatever',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        md5sum: '9999999999999999999999999999999999999999',
        tags: [],
        binary: {
          file: {
            id: '123'
          }
        }
      }

      await this.watcher.pullMany([doc])

      should(apply.calledOnce).be.true()
      should(apply.args[0][0].doc).deepEqual(validMetadata(doc))
    })

    it('tries to apply a deletion otherwise', async function () {
      const doc /*: RemoteDeletion */ = {
        _id: 'missing',
        _rev: 'whatever',
        _deleted: true
      }

      await this.watcher.pullMany([doc])

      should(apply.calledOnce).be.true()
      should(apply.args[0][0].doc).deepEqual(doc)
    })
  })

  describe('analyse', () => {
    describe('case-only renaming', () => {
      it('is identified as a move', function () {
        const oldRemote = builders.remote.file().name('foo').build()
        const oldDoc = createMetadata(oldRemote)
        metadata.ensureValidPath(oldDoc)
        metadata.assignId(oldDoc)
        const newRemote = _.defaults({
          _rev: oldRemote._rev.replace(/^1/, '2'),
          name: 'FOO',
          path: '/FOO'
        }, oldRemote)

        const changes = this.watcher.analyse([newRemote], [oldDoc])

        should(changes.map(c => c.type)).deepEqual(['FileMove'])
        should(changes[0]).have.propertyByPath('doc', 'path').eql('FOO')
        should(changes[0]).have.propertyByPath('was', 'path').eql('foo')
      })
    })

    describe('overwriting move', () => {
      let srcFileDoc, dstFileDoc, olds, srcFileMoved, dstFileTrashed

      beforeEach(() => {
        /* Remote tree:
            /dst/
            /dst/file
            /src/
            /src/file
        */
        const srcDir = builders.remote.dir().name('src').build()
        const dstDir = builders.remote.dir().name('dst').build()
        const srcFile = builders.remote.file().name('file').inDir(srcDir).build()
        const dstFile = builders.remote.file().name('file').inDir(dstDir).build()

        /* Files were synced */
        srcFileDoc = builders.metadata.file().fromRemote(srcFile).upToDate().build()
        dstFileDoc = builders.metadata.file().fromRemote(dstFile).upToDate().build()
        olds = [srcFileDoc, dstFileDoc]

        /* Moving /src/file to /dst/file (overwriting the destination) */
        srcFileMoved = _.defaults({
          _rev: '2-' + uuid().replace(/-/g, ''),
          path: dstFile.path
        }, srcFile)
        dstFileTrashed = _.defaults({
          _rev: '2-' + uuid().replace(/-/g, ''),
          dir_id: TRASH_DIR_ID,
          path: path.posix.join('/', TRASH_DIR_NAME, dstFile.name)
        }, dstFile)
      })

      const relevantChangesProps = changes => changes.map(({type, doc, was}) => {
        const props /*: Object */ = {type, doc: {path: posixifyPath(doc.path)}}
        if (was) props.was = {path: posixifyPath(was.path)}
        if (doc.overwrite) props.doc.overwrite = true
        if (was.overwrite) props.was.overwrite = true
        return props
      })

      it('is detected when moved source is first', function () {
        const docs = [srcFileMoved, dstFileTrashed]
        const changes = this.watcher.analyse(docs, olds)
        should(relevantChangesProps(changes)).deepEqual([
          {type: 'RemoteIgnoredChange', doc: {path: '.cozy_trash/file'}, was: {path: 'dst/file'}},
          {type: 'FileMove', doc: {path: 'dst/file', overwrite: true}, was: {path: 'src/file'}}
        ])
      })

      it('is detected when trashed destination is first', function () {
        const docs = [dstFileTrashed, srcFileMoved]
        const changes = this.watcher.analyse(docs, olds)
        should(relevantChangesProps(changes)).deepEqual([
          {type: 'FileMove', doc: {path: 'dst/file', overwrite: true}, was: {path: 'src/file'}},
          {type: 'RemoteIgnoredChange', doc: {path: '.cozy_trash/file'}, was: {path: 'dst/file'}}
        ])
      })
    })
  })

  describe('identifyChange', function () {
    it('does not fail when the path is missing', function () {
      let doc /*: RemoteDoc */ = {
        _id: '12345678904',
        _rev: '1-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        name: 'whatever',
        path: '',
        md5sum: '9999999999999999999999999999999999999999',
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        tags: [],
        binary: {
          file: {
            id: '123'
          }
        }
      }

      const change /*: RemoteChange */ = this.watcher.identifyChange(doc, null, 0, [])
      should(change.type).equal('RemoteInvalidChange')
      // $FlowFixMe
      should(change.error.message).equal('Invalid path')
    })

    // TODO: missing doctype test
    // TODO: file without checksum

    it('does not fail on ghost file', async function () {
      let doc = {
        _id: '12345678904',
        _rev: '1-abcdef',
        docType: 'file',
        md5sum: '9999999999999999999999999999999999999999',
        path: 'foo',
        name: 'bar'
      }
      const change /*: RemoteChange */ = this.watcher.identifyChange(doc, null, 0, [])

      should(change.type).equal('RemoteInvalidChange')
    })

    onPlatform('win32', () => {
      it('detects path/platform incompatibilities if any', async function () {
        const doc = {
          _id: 'whatever',
          path: '/f:oo/b<a>r',
          md5sum: '9999999999999999999999999999999999999999',
          type: 'file'
        }
        const change /*: RemoteChange */ = this.watcher.identifyChange(doc, null, 0, [])
        const platform = process.platform
        should(change.type).equal('FileAddition')
        should(change.doc).have.property('incompatibilities', [
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

      it('does not detect any when file/dir is in the trash', async function () {
        const change /*: RemoteChange */ = this.watcher.identifyChange({
          _id: 'whatever',
          path: '/.cozy_trash/f:oo/b<a>r',
          md5sum: '9999999999999999999999999999999999999999',
          type: 'file'
        }, null, 0, [])
        should(change.type).not.equal('RemotePlatformIncompatibleChange')
      })
    })

    onPlatform('darwin', () => {
      it('detects when a new file is incompatible', async function () {
        const doc = {
          _id: 'whatever',
          path: '/f:oo/b<a>r',
          md5sum: '9999999999999999999999999999999999999999',
          type: 'file'
        }
        const change /*: RemoteChange */ = this.watcher.identifyChange(doc, null, 0, [])
        const platform = process.platform
        should(change.type).equal('FileAddition')
        should((change /*: any */).doc.incompatibilities).deepEqual([
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
    })

    it('calls addDoc for a new doc', async function () {
      this.prep.addFileAsync = sinon.stub()
      this.prep.addFileAsync.resolves(null)
      let doc /*: RemoteDoc */ = {
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

      const change /*: RemoteChange */ = this.watcher.identifyChange(_.clone(doc), null, 0, [])

      should(change.type).equal('FileAddition')
      should(change.doc).have.properties({
        path: 'my-folder',
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      should(change.doc).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls updateDoc when tags are updated', async function () {
      this.prep.updateFileAsync = sinon.stub()
      this.prep.updateFileAsync.resolves(null)
      let doc /*: RemoteDoc */ = {
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

      const change /*: RemoteChange */ = this.watcher.identifyChange(_.clone(doc), was, 0, [])

      should(change.type).equal('FileUpdate')
      should(change.doc).have.properties({
        path: path.normalize('my-folder/file-1'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
    })

    it('calls updateDoc when content is overwritten', async function () {
      this.prep.updateFileAsync = sinon.stub()
      this.prep.updateFileAsync.resolves(null)
      let doc /*: RemoteDoc */ = {
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

      const change /*: RemoteChange */ = this.watcher.identifyChange(_.clone(doc), was, 0, [])

      should(change.type).equal('FileUpdate')
      should(change.doc).have.properties({
        path: path.normalize('my-folder/file-1'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      should(change.doc).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveFile when file is renamed', async function () {
      this.prep.moveFileAsync = sinon.stub()
      this.prep.moveFileAsync.resolves(null)
      let doc /*: RemoteDoc */ = {
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
      const change /*: RemoteChange */ = this.watcher.identifyChange(_.clone(doc), was, 0, [])

      should(change.type).equal('FileMove')
      // $FlowFixMe
      const src = change.was
      should(src).have.properties({
        path: path.normalize('my-folder/file-2'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: '12345678902'
        }
      })
      const dst = change.doc
      should(dst).have.properties({
        path: 'my-folder',
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      should(dst).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveFile when file is moved', async function () {
      this.prep.moveFileAsync = sinon.stub()
      this.prep.moveFileAsync.resolves(null)
      let doc /*: RemoteDoc */ = {
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
      const was /*: Metadata */ = await this.pouch.db.get(metadata.id(path.normalize('my-folder/file-2')))
      await this.pouch.db.put(was)

      const change /*: RemoteChange */ = this.watcher.identifyChange(_.clone(doc), was, 0, [])

      should(change.type).equal('FileMove')
      should(change).not.have.property('update')
      // $FlowFixMe
      const src = change.was
      should(src).have.properties({
        path: path.normalize('my-folder/file-2'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: '12345678902'
        }
      })
      const dst = change.doc
      should(dst).have.properties({
        path: path.normalize('another-folder/in/some/place'),
        docType: 'file',
        md5sum: doc.md5sum,
        tags: doc.tags,
        remote: {
          _id: doc._id,
          _rev: doc._rev
        }
      })
      should(dst).not.have.properties(['_rev', 'path', 'name'])
    })

    it('detects when file was both moved and updated', async function () {
      const file /*: RemoteDoc */ = await builders.remote.file().name('meow.txt').data('meow').build()
      const was /*: Metadata */ = createMetadata(file)
      metadata.ensureValidPath(was)
      metadata.assignId(was)
      file._rev = '2'
      file.name = 'woof.txt'
      file.path = '/' + file.name
      file.md5sum = 'j9tggB6dOaUoaqAd0fT08w==' // woof

      const change /*: RemoteChange */ = this.watcher.identifyChange(_.clone(file), was, 0, [])

      should(change).have.properties({
        type: 'FileMove',
        update: true
      })
      should(change).have.propertyByPath('was', 'path').eql(was.path)
      should(change).have.propertyByPath('doc', 'path').eql(file.name)
    })

    it('is invalid when local or remote file is corrupt', async function () {
      const doc /*: RemoteDoc */ = builders.remote.file().build()
      const was /*: Metadata */ = createMetadata(doc)
      metadata.ensureValidPath(was)
      metadata.assignId(was)
      should(doc.md5sum).equal(was.md5sum)
      doc.size = '123'
      was.size = 456
      was.remote._rev = '0'

      const change /*: RemoteChange */ = this.watcher.identifyChange(_.clone(doc), was, 0, [])

      should(change).have.property('type', 'RemoteInvalidChange')
      // $FlowFixMe
      should(change.error).match(/corrupt/)
    })

    xit('calls deleteDoc & addDoc when trashed', async function () {
      this.prep.deleteFolderAsync = sinon.stub()
      this.prep.deleteFolderAsync.returnsPromise().resolves(null)
      this.prep.addFolderAsync = sinon.stub()
      this.prep.addFolderAsync.returnsPromise().resolves(null)
      const oldDir /*: RemoteDoc */ = builders.remote.dir().name('foo').build()
      // TODO: builders.dir().fromRemote(oldDir).create()
      let oldMeta /*: Metadata */ = createMetadata(oldDir)
      assignId(oldMeta)
      await this.pouch.db.put(oldMeta)
      // TODO: builders.remote.dir().was(oldDir).trashed().build()
      const newDir /*: RemoteDoc */ = _.defaults({
        path: '/.cozy_trash/foo',
        dir_id: TRASH_DIR_ID
      }, oldDir)

      this.watcher.identifyChange(newDir, null, 0, [])

      should(this.prep.deleteFolderAsync.called).be.true()
      should(this.prep.addFolderAsync.called).be.true()
      const deleteArgs = this.prep.deleteFolderAsync.args[0]
      // FIXME: Make sure oldMeta timestamps are formatted as expected by PouchDB
      delete oldMeta.updated_at
      should(deleteArgs[0]).equal('remote')
      should(deleteArgs[1]).have.properties(oldMeta)
      const addArgs = this.prep.addFolderAsync.args[0]
      should(addArgs[0]).equal('remote')
      should(addArgs[1]).have.properties(createMetadata(newDir))
    })

    xit('calls deleteDoc & addDoc when restored', async function () {
      this.prep.deleteFolder = sinon.stub()
      this.prep.deleteFolder.returnsPromise().resolves(null)
      this.prep.addFolderAsync = sinon.stub()
      this.prep.addFolderAsync.returnsPromise().resolves(null)
      const oldDir /*: RemoteDoc */ = builders.remote.dir().name('foo').trashed().build()
      // TODO: builders.dir().fromRemote(oldDir).create()
      let oldMeta /*: Metadata */ = createMetadata(oldDir)
      assignId(oldMeta)
      await this.pouch.db.put(oldMeta)
      // TODO: builders.remote.dir().was(oldDir).restored().build()
      const newDir /*: RemoteDoc */ = _.defaults({
        path: '/foo',
        dir_id: ROOT_DIR_ID
      }, oldDir)

      this.watcher.identifyChange(newDir, null, 0, [])

      should(this.prep.deleteFolder.called).be.true()
      should(this.prep.addFolderAsync.called).be.true()
      const deleteArgs = this.prep.deleteFolder.args[0]
      // FIXME: Make sure oldMeta timestamps are formatted as expected by PouchDB
      delete oldMeta.updated_at
      should(deleteArgs[0]).equal('remote')
      should(deleteArgs[1]).have.properties(oldMeta)
      const addArgs = this.prep.addFolderAsync.args[0]
      should(addArgs[0]).equal('remote')
      should(addArgs[1]).have.properties(createMetadata(newDir))
    })
  })

  describe('dissociateFromRemote', function () {
    it('remove the association between a document and its remote', async function () {
      let doc = {
        _id: 'dissociateFromRemote',
        path: 'dissociateFromRemote',
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

      await this.watcher.dissociateFromRemote(was)

      const actual = await this.pouch.db.get(doc._id)
      should.not.exist(actual.sides.remote)
      should.not.exist(actual.remote)
      actual._id.should.equal(doc._id)
      actual.sides.local.should.equal('2')
    })
  })
})
