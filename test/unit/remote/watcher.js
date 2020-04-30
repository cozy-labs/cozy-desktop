/* @flow */
/* eslint-env mocha */

const EventEmitter = require('events')
const faker = require('faker')
const _ = require('lodash')
const path = require('path')
const sinon = require('sinon')
const should = require('should')
const CozyClient = require('cozy-client-js').Client
const { Promise } = require('bluebird')

const configHelpers = require('../../support/helpers/config')
const { posixifyPath } = require('../../support/helpers/context_dir')
const { onPlatform, onPlatforms } = require('../../support/helpers/platform')
const pouchHelpers = require('../../support/helpers/pouch')
const { builders } = require('../../support/helpers/cozy')

const metadata = require('../../../core/metadata')
const { FILES_DOCTYPE } = require('../../../core/remote/constants')
const Prep = require('../../../core/prep')
const {
  CozyClientRevokedError,
  RemoteCozy
} = require('../../../core/remote/cozy')
const { MergeMissingParentError } = require('../../../core/merge')
const { RemoteWatcher } = require('../../../core/remote/watcher')

const { assignId, ensureValidPath } = metadata

/*::
import type { RemoteChange } from '../../../core/remote/change'
import type { RemoteDoc, RemoteDeletion } from '../../../core/remote/document'
import type { Metadata } from '../../../core/metadata'
*/

describe('RemoteWatcher', function() {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(function instanciateRemoteWatcher() {
    this.prep = sinon.createStubInstance(Prep)
    this.prep.config = this.config
    this.remoteCozy = new RemoteCozy(this.config)
    this.remoteCozy.client = new CozyClient({
      cozyURL: this.config.cozyUrl,
      token: process.env.COZY_STACK_TOKEN
    })
    this.events = new EventEmitter()
    this.watcher = new RemoteWatcher(
      this.pouch,
      this.prep,
      this.remoteCozy,
      this.events
    )
  })
  afterEach(function() {
    this.watcher.stop()
  })
  afterEach(function removeEventListeners() {
    this.events.removeAllListeners()
  })
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    await pouchHelpers.createParentFolder(this.pouch)
    // FIXME: Tests pass without folder 3 & file 3
    for (let i of [1, 2, 3]) {
      await pouchHelpers.createFolder(
        this.pouch,
        path.join('my-folder', `folder-${i}`)
      )
      await pouchHelpers.createFile(
        this.pouch,
        path.join('my-folder', `file-${i}`)
      )
    }
  })

  describe('start', function() {
    it('calls watch() a first time', async function() {
      sinon.stub(this.watcher, 'watch').returns(Promise.resolve())
      await this.watcher.start()
      this.watcher.watch.callCount.should.equal(1)
    })

    async function fakeWatch() {
      throw new Error('from watch')
    }

    it('returns a promise that rejects on error during first watch()', async function() {
      sinon.stub(this.watcher, 'watch').callsFake(fakeWatch)
      await should(this.watcher.start()).be.rejectedWith('from watch')
    })

    it('sets a "running" promise that rejects on error during second watch()', async function() {
      sinon
        .stub(this.watcher, 'watch')
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .callsFake(fakeWatch)
      await this.watcher.start()
      await should(this.watcher.running).be.rejectedWith('from watch')
    })
  })

  describe('stop', function() {
    beforeEach(function() {
      sinon.stub(this.watcher, 'watch').returns(Promise.resolve())
    })

    afterEach(function() {
      this.watcher.watch.restore()
    })

    it('ensures watch is not called anymore', async function() {
      await this.watcher.start()
      should(this.watcher.runningResolve).not.be.null()
      this.watcher.stop()
      should(this.watcher.runningResolve).be.null()
      await should(this.watcher.running).be.fulfilled()
    })

    it('does nothing when called again', async function() {
      await this.watcher.start()
      this.watcher.stop()
      this.watcher.stop()
    })
  })

  describe('watch', function() {
    const lastLocalSeq = '123'
    const lastRemoteSeq = lastLocalSeq + '456'
    const changes = {
      last_seq: lastRemoteSeq,
      docs: [builders.remoteFile().build(), builders.remoteDir().build()]
    }

    beforeEach(function() {
      sinon.stub(this.pouch, 'getRemoteSeqAsync')
      sinon.stub(this.pouch, 'setRemoteSeqAsync')
      sinon.stub(this.watcher, 'pullMany')
      sinon.stub(this.remoteCozy, 'changes')
      sinon.spy(this.events, 'emit')

      this.pouch.getRemoteSeqAsync.resolves(lastLocalSeq)
      this.watcher.pullMany.resolves([])
      this.remoteCozy.changes.resolves(changes)
    })

    afterEach(function() {
      this.events.emit.restore()
      this.remoteCozy.changes.restore()
      this.watcher.pullMany.restore()
      this.pouch.setRemoteSeqAsync.restore()
      this.pouch.getRemoteSeqAsync.restore()
    })

    it('pulls the changed files/dirs', async function() {
      await this.watcher.watch()
      this.watcher.pullMany.should.be
        .calledOnce()
        .and.be.calledWithExactly(changes.docs)
    })

    it('updates the last update sequence in local db', async function() {
      await this.watcher.watch()
      this.pouch.setRemoteSeqAsync.should.be
        .calledOnce()
        .and.be.calledWithExactly(lastRemoteSeq)
    })

    context('on error while fetching changes', () => {
      /* cozy-client-js defines its own FetchError type which is not exported.
       * This means we can't use the FetchError class from electron-fetch to
       * simulate network errors in cozy-client-js calls.
       */
      const CozyFetchError = function(message) {
        this.name = 'FetchError'
        this.response = {}
        this.url = faker.internet.url
        this.reason = message
        this.message = message
      }
      const randomMessage = faker.random.words
      let err

      beforeEach(function() {
        err = new CozyFetchError(randomMessage())
        this.remoteCozy.changes.rejects(err)
      })

      context('when next #watch() has no chance to work anymore', () => {
        beforeEach(() => {
          err.status = 400 // Revoked
        })

        it('rejects with a higher-level error', async function() {
          await should(this.watcher.watch()).be.rejectedWith(
            new CozyClientRevokedError()
          )
        })
      })

      context('when next #watch() could work', () => {
        beforeEach(() => {
          err.status = 500 // Possibly temporary error
        })

        it('does not reject', async function() {
          await should(this.watcher.watch()).not.be.rejected()
        })
      })
    })

    context('on Pouch reserved ids error', () => {
      const reservedIdsError = {
        err: {
          name: 'bad_request',
          status: 400,
          message: 'Only reserved document ids may start with underscore.'
        }
      }

      beforeEach(function() {
        this.watcher.pullMany.returns([reservedIdsError])
      })

      it('rejects', async function() {
        await should(this.watcher.watch()).be.rejected()
      })

      it('does not reject client revoked error', async function() {
        try {
          await this.watcher.watch()
        } catch (e) {
          should(e).not.be.an.instanceof(CozyClientRevokedError)
        }
      })
    })

    context('on MergeMissingParentError', () => {
      const missingParentError = {
        err: new MergeMissingParentError(builders.metadata().build())
      }

      beforeEach(function() {
        this.watcher.pullMany.returns([missingParentError])
      })

      it('does not reject any errors', async function() {
        await should(this.watcher.watch()).be.fulfilled()
      })
    })
  })

  const validMetadata = (remoteDoc /*: RemoteDoc */) /*: Metadata */ => {
    const doc = metadata.fromRemoteDoc(remoteDoc)
    ensureValidPath(doc)
    assignId(doc)
    return doc
  }

  describe('pullMany', function() {
    const remoteDocs = [
      builders.remoteFile().build(),
      {
        ...builders.remoteFile().build(),
        _deleted: true
      }
    ]
    let apply
    let findMaybe

    beforeEach(function() {
      apply = sinon.stub(this.watcher, 'apply')
      findMaybe = sinon.stub(this.remoteCozy, 'findMaybe')
    })

    afterEach(function() {
      apply.restore()
      findMaybe.restore()
    })

    it('pulls many changed files/dirs given their ids', async function() {
      apply.resolves()

      await this.watcher.pullMany(remoteDocs)

      apply.callCount.should.equal(2)
      // Changes are sorted before applying (first one was given Metadata since
      // it is valid while the second one got the original RemoteDeletion since
      // it is ignored)
      should(apply.args[0][0].doc).deepEqual(validMetadata(remoteDocs[0]))
      should(apply.args[1][0].doc).deepEqual(remoteDocs[1])
    })

    context('when apply() rejects some file/dir', function() {
      beforeEach(function() {
        apply.callsFake(async (
          change /*: RemoteChange */
        ) /*: Promise<?{ change: RemoteChange, err: Error }> */ => {
          if (change.type === 'FileAddition')
            return { change, err: new Error(change.doc) }
        })
      })

      it('resolves with an array of errors', async function() {
        const errors = await this.watcher.pullMany(remoteDocs)
        should(errors).have.size(1)
        should(errors[0].err).eql(new Error(remoteDocs[0]))
      })

      it('still tries to pull other files/dirs', async function() {
        await this.watcher.pullMany(remoteDocs).catch(() => {})
        should(apply.args[0][0]).have.properties({
          type: 'FileAddition',
          doc: validMetadata(remoteDocs[0])
        })
        should(apply.args[1][0]).have.properties({
          type: 'IgnoredChange',
          doc: remoteDocs[1]
        })
      })

      it('retries failed changes application until none can be applied', async function() {
        const remoteDocs = [
          builders.remoteFile().build(),
          {
            ...builders.remoteFile().build(),
            _deleted: true
          },
          builders.remoteFile().build()
        ]
        await this.watcher.pullMany(remoteDocs).catch(() => {})
        should(apply).have.callCount(5)
        should(apply.args[0][0]).have.properties({
          type: 'FileAddition',
          doc: validMetadata(remoteDocs[0])
        })
        should(apply.args[1][0]).have.properties({
          type: 'FileAddition',
          doc: validMetadata(remoteDocs[2])
        })
        should(apply.args[3][0]).have.properties({
          type: 'FileAddition',
          doc: validMetadata(remoteDocs[0])
        })
        should(apply.args[4][0]).have.properties({
          type: 'FileAddition',
          doc: validMetadata(remoteDocs[2])
        })
      })

      it('releases the Pouch lock', async function() {
        await this.watcher.pullMany(remoteDocs).catch(() => {})
        const nextLockPromise = this.pouch.lock('nextLock')
        await should(nextLockPromise).be.fulfilled()
      })

      it('does not update the remote sequence', async function() {
        const remoteSeq = await this.pouch.getRemoteSeqAsync()
        await this.watcher.pullMany(remoteDocs).catch(() => {})
        should(this.pouch.getRemoteSeqAsync()).be.fulfilledWith(remoteSeq)
      })
    })

    it('applies the changes when the document still exists on remote', async function() {
      let remoteDoc /*: RemoteDoc */ = {
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

      await this.watcher.pullMany([remoteDoc])

      should(apply.calledOnce).be.true()
      should(apply.args[0][0].doc).deepEqual(validMetadata(remoteDoc))
    })

    it('tries to apply a deletion otherwise', async function() {
      const remoteDoc /*: RemoteDeletion */ = {
        _id: 'missing',
        _rev: 'whatever',
        _deleted: true
      }

      await this.watcher.pullMany([remoteDoc])

      should(apply.calledOnce).be.true()
      should(apply.args[0][0].doc).deepEqual(remoteDoc)
    })
  })

  describe('analyse', () => {
    describe('case-only renaming', () => {
      it('is identified as a move', function() {
        const oldRemote = builders
          .remoteFile()
          .name('foo')
          .build()
        const oldDoc = metadata.fromRemoteDoc(oldRemote)
        metadata.ensureValidPath(oldDoc)
        metadata.assignId(oldDoc)
        const newRemote = _.defaults(
          {
            _rev: oldRemote._rev.replace(/^1/, '2'),
            name: 'FOO',
            path: '/FOO'
          },
          oldRemote
        )

        const changes = this.watcher.analyse([newRemote], [oldDoc])

        should(changes.map(c => c.type)).deepEqual(['FileMove'])
        should(changes[0])
          .have.propertyByPath('doc', 'path')
          .eql('FOO')
        should(changes[0])
          .have.propertyByPath('was', 'path')
          .eql('foo')
      })
    })

    describe('file move overwriting trashed destination', () => {
      let srcFileDoc, dstFileDoc, olds, srcFileMoved, dstFileTrashed

      beforeEach(() => {
        const remoteDocs = builders.buildRemoteTree([
          'dst/',
          'dst/file',
          'src/',
          'src/file'
        ])

        /* Files were synced */
        srcFileDoc = builders
          .metafile()
          .fromRemote(remoteDocs['src/file'])
          .upToDate()
          .build()
        dstFileDoc = builders
          .metafile()
          .fromRemote(remoteDocs['dst/file'])
          .upToDate()
          .build()
        olds = [srcFileDoc, dstFileDoc]

        /* Moving /src/file to /dst/file (overwriting the destination) */
        srcFileMoved = builders
          .remoteFile(remoteDocs['src/file'])
          .shortRev(2)
          .inDir(remoteDocs['dst/'])
          .build()
        dstFileTrashed = builders
          .remoteFile(remoteDocs['dst/file'])
          .shortRev(2)
          .trashed()
          .build()
      })

      const relevantChangesProps = changes =>
        changes.map(({ type, doc, was }) => {
          const props /*: Object */ = {
            type,
            doc: { path: posixifyPath(doc.path) }
          }
          if (was) props.was = { path: posixifyPath(was.path) }
          if (doc.overwrite) props.doc.overwrite = true
          if (was.overwrite) props.was.overwrite = true
          return props
        })

      it('is detected when moved source is first', function() {
        const remoteDocs = [srcFileMoved, dstFileTrashed]
        const changes = this.watcher.analyse(remoteDocs, olds)
        should(relevantChangesProps(changes)).deepEqual([
          {
            type: 'FileMove',
            doc: { path: 'dst/file', overwrite: true },
            was: { path: 'src/file' }
          },
          {
            type: 'IgnoredChange',
            doc: { path: '.cozy_trash/file' },
            was: { path: 'dst/file' }
          }
        ])
      })

      it('is detected when trashed destination is first', function() {
        const remoteDocs = [dstFileTrashed, srcFileMoved]
        const changes = this.watcher.analyse(remoteDocs, olds)
        should(relevantChangesProps(changes)).deepEqual([
          {
            type: 'FileMove',
            doc: { path: 'dst/file', overwrite: true },
            was: { path: 'src/file' }
          },
          {
            type: 'IgnoredChange',
            doc: { path: '.cozy_trash/file' },
            was: { path: 'dst/file' }
          }
        ])
      })
    })

    describe('file move not overwriting trashed uppercase destination', () => {
      let srcFileDoc, dstFileDoc, olds, srcFileMoved, dstFileTrashed

      beforeEach(() => {
        const remoteDocs = builders.buildRemoteTree([
          'dst/',
          'dst/FILE',
          'src/',
          'src/file'
        ])

        /* Files were synced */
        srcFileDoc = builders
          .metafile()
          .fromRemote(remoteDocs['src/file'])
          .upToDate()
          .build()
        dstFileDoc = builders
          .metafile()
          .fromRemote(remoteDocs['dst/FILE'])
          .upToDate()
          .build()
        olds = [srcFileDoc, dstFileDoc]

        /* Moving /src/file to /dst/file (overwriting the destination) */
        srcFileMoved = builders
          .remoteFile(remoteDocs['src/file'])
          .shortRev(2)
          .inDir(remoteDocs['dst/'])
          .build()
        dstFileTrashed = builders
          .remoteFile(remoteDocs['dst/FILE'])
          .shortRev(2)
          .trashed()
          .build()
      })

      const relevantChangesProps = changes =>
        changes.map(({ type, doc, was }) => {
          const props /*: Object */ = {
            type,
            doc: { path: posixifyPath(doc.path) }
          }
          if (was) props.was = { path: posixifyPath(was.path) }
          if (doc.overwrite) props.doc.overwrite = true
          if (was.overwrite) props.was.overwrite = true
          return props
        })

      describe('when moved source is first', () => {
        onPlatforms(['win32', 'darwin'], () => {
          it('sorts the trashing before the move to prevent id confusion', function() {
            const remoteDocs = [srcFileMoved, dstFileTrashed]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'FileTrashing',
                doc: { path: '.cozy_trash/FILE' },
                was: { path: 'dst/FILE' }
              },
              {
                type: 'FileMove',
                doc: { path: 'dst/file' },
                was: { path: 'src/file' }
              }
            ])
          })
        })

        onPlatform('linux', () => {
          it('sorts the move before the trashing', function() {
            const remoteDocs = [srcFileMoved, dstFileTrashed]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'FileTrashing',
                doc: { path: '.cozy_trash/FILE' },
                was: { path: 'dst/FILE' }
              },
              {
                type: 'FileMove',
                doc: { path: 'dst/file' },
                was: { path: 'src/file' }
              }
            ])
          })
        })
      })

      describe('when trashed destination is first', () => {
        onPlatforms(['win32', 'darwin'], () => {
          it('sorts the trashing before the move to prevent id confusion', function() {
            const remoteDocs = [dstFileTrashed, srcFileMoved]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'FileTrashing',
                doc: { path: '.cozy_trash/FILE' },
                was: { path: 'dst/FILE' }
              },
              {
                type: 'FileMove',
                doc: { path: 'dst/file' },
                was: { path: 'src/file' }
              }
            ])
          })
        })

        onPlatform('linux', () => {
          it('sorts the move before the trashing', function() {
            const remoteDocs = [dstFileTrashed, srcFileMoved]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'FileTrashing',
                doc: { path: '.cozy_trash/FILE' },
                was: { path: 'dst/FILE' }
              },
              {
                type: 'FileMove',
                doc: { path: 'dst/file' },
                was: { path: 'src/file' }
              }
            ])
          })
        })
      })
    })

    describe('dir move overwriting trashed destination', () => {
      let srcDoc, dstDoc, olds, srcMoved, dstTrashed

      beforeEach(() => {
        const remoteDocs = builders.buildRemoteTree([
          'dst/',
          'dst/dir/',
          'src/',
          'src/dir/'
        ])

        /* Directories were synced */
        srcDoc = builders
          .metadir()
          .fromRemote(remoteDocs['src/dir/'])
          .upToDate()
          .build()
        dstDoc = builders
          .metadir()
          .fromRemote(remoteDocs['dst/dir/'])
          .upToDate()
          .build()
        olds = [srcDoc, dstDoc]

        /* Moving /src/dir to /dst/dir (overwriting the destination) */
        srcMoved = builders
          .remoteDir(remoteDocs['src/dir/'])
          .shortRev(2)
          .inDir(remoteDocs['dst/'])
          .build()
        dstTrashed = builders
          .remoteDir(remoteDocs['dst/dir/'])
          .shortRev(2)
          .trashed()
          .build()
      })

      const relevantChangesProps = changes =>
        changes.map(({ type, doc, was }) => {
          const props /*: Object */ = {
            type,
            doc: { path: posixifyPath(doc.path) }
          }
          if (was) props.was = { path: posixifyPath(was.path) }
          if (doc.overwrite) props.doc.overwrite = true
          if (was.overwrite) props.was.overwrite = true
          return props
        })

      it('is detected when moved source is first', function() {
        const remoteDocs = [srcMoved, dstTrashed]
        const changes = this.watcher.analyse(remoteDocs, olds)
        should(relevantChangesProps(changes)).deepEqual([
          {
            type: 'DirMove',
            doc: { path: 'dst/dir', overwrite: true },
            was: { path: 'src/dir' }
          },
          {
            type: 'IgnoredChange',
            doc: { path: '.cozy_trash/dir' },
            was: { path: 'dst/dir' }
          }
        ])
      })

      it('is detected when trashed destination is first', function() {
        const remoteDocs = [dstTrashed, srcMoved]
        const changes = this.watcher.analyse(remoteDocs, olds)
        should(relevantChangesProps(changes)).deepEqual([
          {
            type: 'DirMove',
            doc: { path: 'dst/dir', overwrite: true },
            was: { path: 'src/dir' }
          },
          {
            type: 'IgnoredChange',
            doc: { path: '.cozy_trash/dir' },
            was: { path: 'dst/dir' }
          }
        ])
      })
    })

    describe('dir move not overwriting trashed uppercase destination', () => {
      let srcDoc, dstDoc, olds, srcMoved, dstTrashed

      beforeEach(() => {
        const remoteDocs = builders.buildRemoteTree([
          'dst/',
          'dst/DIR/',
          'src/',
          'src/dir/'
        ])

        /* Directories were synced */
        srcDoc = builders
          .metadir()
          .fromRemote(remoteDocs['src/dir/'])
          .upToDate()
          .build()
        dstDoc = builders
          .metadir()
          .fromRemote(remoteDocs['dst/DIR/'])
          .upToDate()
          .build()
        olds = [srcDoc, dstDoc]

        /* Moving /src/dir to /dst/dir (overwriting the destination) */
        srcMoved = builders
          .remoteDir(remoteDocs['src/dir/'])
          .shortRev(2)
          .inDir(remoteDocs['dst/'])
          .build()
        dstTrashed = builders
          .remoteDir(remoteDocs['dst/DIR/'])
          .shortRev(2)
          .trashed()
          .build()
      })

      const relevantChangesProps = changes =>
        changes.map(({ type, doc, was }) => {
          const props /*: Object */ = {
            type,
            doc: { path: posixifyPath(doc.path) }
          }
          if (was) props.was = { path: posixifyPath(was.path) }
          if (doc.overwrite) props.doc.overwrite = true
          if (was.overwrite) props.was.overwrite = true
          return props
        })

      describe('when moved source is first', () => {
        onPlatforms(['win32', 'darwin'], () => {
          it('sorts the trashing before the move to prevent id confusion', function() {
            const remoteDocs = [srcMoved, dstTrashed]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'DirTrashing',
                doc: { path: '.cozy_trash/DIR' },
                was: { path: 'dst/DIR' }
              },
              {
                type: 'DirMove',
                doc: { path: 'dst/dir' },
                was: { path: 'src/dir' }
              }
            ])
          })
        })

        onPlatform('linux', () => {
          it('sorts the trashing before the move ', function() {
            const remoteDocs = [srcMoved, dstTrashed]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'DirTrashing',
                doc: { path: '.cozy_trash/DIR' },
                was: { path: 'dst/DIR' }
              },
              {
                type: 'DirMove',
                doc: { path: 'dst/dir' },
                was: { path: 'src/dir' }
              }
            ])
          })
        })
      })

      describe('when trashed destination is first', () => {
        onPlatforms(['win32', 'darwin'], () => {
          it('sorts the trashing before the move to prevent id confusion', function() {
            const remoteDocs = [dstTrashed, srcMoved]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'DirTrashing',
                doc: { path: '.cozy_trash/DIR' },
                was: { path: 'dst/DIR' }
              },
              {
                type: 'DirMove',
                doc: { path: 'dst/dir' },
                was: { path: 'src/dir' }
              }
            ])
          })
        })

        onPlatform('linux', () => {
          it('sorts the trashing before the move', function() {
            const remoteDocs = [dstTrashed, srcMoved]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'DirTrashing',
                doc: { path: '.cozy_trash/DIR' },
                was: { path: 'dst/DIR' }
              },
              {
                type: 'DirMove',
                doc: { path: 'dst/dir' },
                was: { path: 'src/dir' }
              }
            ])
          })
        })
      })
    })

    describe('descendantMoves', () => {
      it('handles correctly descendantMoves', function() {
        const remoteDir1 = builders
          .remoteDir()
          .name('src')
          .build()
        const remoteDir2 = builders
          .remoteDir()
          .name('parent')
          .inDir(remoteDir1)
          .build()
        const remoteFile = builders
          .remoteFile()
          .name('child')
          .inDir(remoteDir2)
          .build()
        const olds = [remoteDir1, remoteDir2, remoteFile].map(oldRemote => {
          const oldDoc = metadata.fromRemoteDoc(oldRemote)
          metadata.ensureValidPath(oldDoc)
          metadata.assignId(oldDoc)
          return oldDoc
        })

        const updated = (old, changes) =>
          _.defaults(
            {
              _rev: old._rev.replace(/^1-[0-9a-z]{3}/, '2-xxx')
            },
            changes,
            old
          )

        const shouldBeExpected = result => {
          result.should.have.length(3)
          result
            .map(x => ({
              type: x.type,
              oldPath: x.was.path,
              path: x.doc.path,
              ancestorPath: x.ancestorPath
            }))
            .sort((a, b) => a.path - b.path)
            .should.deepEqual([
              {
                type: 'DirMove',
                oldPath: 'src',
                path: 'dst',
                ancestorPath: undefined
              },
              {
                type: 'DescendantChange',
                oldPath: path.normalize('src/parent'),
                path: path.normalize('dst/parent'),
                ancestorPath: 'dst'
              },
              {
                type: 'DescendantChange',
                oldPath: path.normalize('src/parent/child'),
                path: path.normalize('dst/parent/child'),
                ancestorPath: path.normalize('dst/parent')
              }
            ])
        }

        shouldBeExpected(
          this.watcher.analyse(
            [
              updated(remoteFile, { path: '/dst/parent/child' }),
              updated(remoteDir2, { path: '/dst/parent' }),
              updated(remoteDir1, { name: 'dst', path: '/dst' })
            ],
            olds
          )
        )

        shouldBeExpected(
          this.watcher.analyse(
            [
              updated(remoteDir1, { name: 'dst', path: '/dst' }),
              updated(remoteDir2, { path: '/dst/parent' }),
              updated(remoteFile, { path: '/dst/parent/child' })
            ],
            olds
          )
        )

        shouldBeExpected(
          this.watcher.analyse(
            [
              updated(remoteDir1, { name: 'dst', path: '/dst' }),
              updated(remoteFile, { path: '/dst/parent/child' }),
              updated(remoteDir2, { path: '/dst/parent' })
            ],
            olds
          )
        )
      })
    })
  })

  describe('identifyAll', () => {
    it('identifies all descendant moves', function() {
      const remotePaths = [
        ['parent/', 1],
        ['parent/src/', 1],
        ['parent/dst/', 1],
        ['parent/dst/dir/', 2],
        ['parent/dst/dir/empty-subdir/', 2],
        ['parent/dst/dir/subdir/', 2],
        ['parent/dst/dir/subdir/filerenamed', 3],
        ['parent/dst/dir/subdir/filerenamed2', 3]
      ]
      const remoteDocsByPath = builders.buildRemoteTree(remotePaths)
      const remoteDocs = remotePaths.map(p => remoteDocsByPath[p[0]])
      const olds = [
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/'])
          .path('parent')
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/'])
          .path(path.normalize('parent/dst'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/src/'])
          .path(path.normalize('parent/src'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/dir/'])
          .path(path.normalize('parent/src/dir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/dir/empty-subdir/'])
          .path(path.normalize('parent/src/dir/empty-subdir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/dir/subdir/'])
          .path(path.normalize('parent/src/dir/subdir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/dir/subdir/filerenamed'])
          .path(path.normalize('parent/src/dir/subdir/file'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/dir/subdir/filerenamed2'])
          .path(path.normalize('parent/src/dir/subdir/file2'))
          .upToDate()
          .remoteRev(1)
          .build()
      ]
      const changes = this.watcher.identifyAll(remoteDocs, olds)

      const changeInfo = change => ({
        doc: { path: change.doc.path },
        type: change.type,
        was: { path: change.was && change.was.path }
      })

      should(changes.map(changeInfo)).deepEqual([
        {
          doc: { path: path.normalize('parent') },
          type: 'UpToDate',
          was: { path: path.normalize('parent') }
        },
        {
          doc: { path: path.normalize('parent/src') },
          type: 'UpToDate',
          was: { path: path.normalize('parent/src') }
        },
        {
          doc: { path: path.normalize('parent/dst') },
          type: 'UpToDate',
          was: { path: path.normalize('parent/dst') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/src/dir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/empty-subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file2') }
        }
      ])
    })

    it('identifies move from inside move', function() {
      const remotePaths = [
        ['parent/', 1],
        ['parent/src/', 1],
        ['parent/dst/', 1],
        ['parent/dst2/', 1],
        ['parent/dst/dir/', 2],
        ['parent/dst/dir/empty-subdir/', 2],
        ['parent/dst2/subdir/', 3],
        ['parent/dst2/subdir/file', 3]
      ]
      const remoteDocsByPath = builders.buildRemoteTree(remotePaths)
      const remoteDocs = remotePaths.map(p => remoteDocsByPath[p[0]])
      const olds = [
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/'])
          .path('parent')
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/'])
          .path(path.normalize('parent/dst'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst2/'])
          .path(path.normalize('parent/dst2'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/src/'])
          .path(path.normalize('parent/src'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/dir/'])
          .path(path.normalize('parent/src/dir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst/dir/empty-subdir/'])
          .path(path.normalize('parent/src/dir/empty-subdir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst2/subdir/'])
          .path(path.normalize('parent/src/dir/subdir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(remoteDocsByPath['parent/dst2/subdir/file'])
          .path(path.normalize('parent/src/dir/subdir/file'))
          .upToDate()
          .remoteRev(1)
          .build()
      ]
      const changes = this.watcher.identifyAll(remoteDocs, olds)

      const changeInfo = change => ({
        doc: { path: change.doc.path },
        type: change.type,
        was: { path: change.was && change.was.path }
      })

      should(changes.map(changeInfo)).deepEqual([
        {
          doc: { path: path.normalize('parent') },
          type: 'UpToDate',
          was: { path: path.normalize('parent') }
        },
        {
          doc: { path: path.normalize('parent/src') },
          type: 'UpToDate',
          was: { path: path.normalize('parent/src') }
        },
        {
          doc: { path: path.normalize('parent/dst') },
          type: 'UpToDate',
          was: { path: path.normalize('parent/dst') }
        },
        {
          doc: { path: path.normalize('parent/dst2') },
          type: 'UpToDate',
          was: { path: path.normalize('parent/dst2') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/src/dir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/empty-subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst2/subdir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/dst/dir/subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst2/subdir/file') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/subdir/file') }
        }
      ])
    })

    describe('identifies move inside move inside move', () => {
      const changeInfo = change => ({
        doc: { path: change.doc.path },
        type: change.type,
        was: { path: change.was && change.was.path }
      })

      const remotePaths = [
        ['parent/', 1],
        ['parent/dst/', 2],
        ['parent/dst/dir2/', 3],
        ['parent/dst/dir2/empty-subdir/', 3],
        ['parent/dst/dir2/subdir/', 3],
        ['parent/dst/dir2/subdir/file2', 4]
      ]

      let remoteDocsByPath, olds
      beforeEach('build changes', () => {
        remoteDocsByPath = builders.buildRemoteTree(remotePaths)
        olds = [
          builders
            .metadir()
            .fromRemote(remoteDocsByPath['parent/'])
            .path('parent')
            .upToDate()
            .build(),
          builders
            .metadir()
            .fromRemote(remoteDocsByPath['parent/dst/'])
            .path(path.normalize('parent/src'))
            .upToDate()
            .remoteRev(1)
            .build(),
          builders
            .metadir()
            .fromRemote(remoteDocsByPath['parent/dst/dir2/'])
            .path(path.normalize('parent/src/dir'))
            .upToDate()
            .remoteRev(1)
            .build(),
          builders
            .metadir()
            .fromRemote(remoteDocsByPath['parent/dst/dir2/empty-subdir/'])
            .path(path.normalize('parent/src/dir/empty-subdir'))
            .upToDate()
            .remoteRev(1)
            .build(),
          builders
            .metadir()
            .fromRemote(remoteDocsByPath['parent/dst/dir2/subdir/'])
            .path(path.normalize('parent/src/dir/subdir'))
            .upToDate()
            .remoteRev(1)
            .build(),
          builders
            .metadir()
            .fromRemote(remoteDocsByPath['parent/dst/dir2/subdir/file2'])
            .path(path.normalize('parent/src/dir/subdir/file'))
            .upToDate()
            .remoteRev(1)
            .build()
        ]
      })

      it('sorts correctly order1', function() {
        const order1 = [
          remoteDocsByPath['parent/dst/dir2/'],
          remoteDocsByPath['parent/dst/'],
          remoteDocsByPath['parent/dst/dir2/empty-subdir/'],
          remoteDocsByPath['parent/dst/dir2/subdir/file2'],
          remoteDocsByPath['parent/dst/dir2/subdir/']
        ]
        should(
          this.watcher.identifyAll(order1, olds).map(changeInfo)
        ).deepEqual([
          {
            doc: { path: path.normalize('parent/dst/dir2') },
            type: 'DirMove',
            was: { path: path.normalize('parent/dst/dir') }
          },
          {
            doc: { path: path.normalize('parent/dst') },
            type: 'DirMove',
            was: { path: path.normalize('parent/src') }
          },
          {
            doc: { path: path.normalize('parent/dst/dir2/empty-subdir') },
            type: 'DescendantChange',
            was: { path: path.normalize('parent/src/dir/empty-subdir') }
          },
          {
            doc: { path: path.normalize('parent/dst/dir2/subdir/file2') },
            type: 'FileMove',
            was: { path: path.normalize('parent/dst/dir2/subdir/file') }
          },
          {
            doc: { path: path.normalize('parent/dst/dir2/subdir') },
            type: 'DescendantChange',
            was: { path: path.normalize('parent/src/dir/subdir') }
          }
        ])
      })

      it('sorts correctly order2', function() {
        const order2 = [
          remoteDocsByPath['parent/dst/dir2/subdir/'],
          remoteDocsByPath['parent/dst/'],
          remoteDocsByPath['parent/dst/dir2/'],
          remoteDocsByPath['parent/dst/dir2/subdir/file2'],
          remoteDocsByPath['parent/dst/dir2/empty-subdir/']
        ]
        should(
          this.watcher.identifyAll(order2, olds).map(changeInfo)
        ).deepEqual([
          {
            doc: { path: path.normalize('parent/dst/dir2/subdir') },
            type: 'DescendantChange',
            was: { path: path.normalize('parent/src/dir/subdir') }
          },
          {
            doc: { path: path.normalize('parent/dst') },
            type: 'DirMove',
            was: { path: path.normalize('parent/src') }
          },
          {
            doc: { path: path.normalize('parent/dst/dir2') },
            type: 'DirMove',
            was: { path: path.normalize('parent/dst/dir') }
          },
          {
            doc: { path: path.normalize('parent/dst/dir2/subdir/file2') },
            type: 'FileMove',
            was: { path: path.normalize('parent/dst/dir2/subdir/file') }
          },
          {
            doc: { path: path.normalize('parent/dst/dir2/empty-subdir') },
            type: 'DescendantChange',
            was: { path: path.normalize('parent/src/dir/empty-subdir') }
          }
        ])
      })
    })
  })

  describe('identifyChange', function() {
    it('does not fail when the path is missing', function() {
      let remoteDoc /*: RemoteDoc */ = {
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

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        remoteDoc,
        null,
        [],
        []
      )
      should(change.type).equal('InvalidChange')
      // $FlowFixMe
      should(change.error.message).equal('Invalid path')
    })

    // TODO: missing doctype test
    // TODO: file without checksum

    it('does not fail on ghost file', async function() {
      let remoteDoc = {
        _id: '12345678904',
        _rev: '1-abcdef',
        docType: 'file',
        md5sum: '9999999999999999999999999999999999999999',
        path: 'foo',
        name: 'bar'
      }
      const change /*: RemoteChange */ = this.watcher.identifyChange(
        remoteDoc,
        null,
        [],
        []
      )

      should(change.type).equal('InvalidChange')
    })

    onPlatform('win32', () => {
      it('detects path/platform incompatibilities if any', async function() {
        const remoteDoc = {
          _id: 'whatever',
          path: '/f:oo/b<a>r',
          md5sum: '9999999999999999999999999999999999999999',
          type: 'file'
        }
        const change /*: RemoteChange */ = this.watcher.identifyChange(
          remoteDoc,
          null,
          [],
          []
        )
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

      it('does not detect any when file/dir is in the trash', async function() {
        const change /*: RemoteChange */ = this.watcher.identifyChange(
          {
            _id: 'whatever',
            path: '/.cozy_trash/f:oo/b<a>r',
            md5sum: '9999999999999999999999999999999999999999',
            type: 'file'
          },
          null,
          [],
          []
        )
        should(change.type).not.equal('RemotePlatformIncompatibleChange')
      })
    })

    onPlatform('darwin', () => {
      it('does not mistakenly assume a new file is incompatible', async function() {
        const remoteDoc = {
          _id: 'whatever',
          path: '/f:oo/b<a>r',
          md5sum: '9999999999999999999999999999999999999999',
          type: 'file'
        }
        const change /*: RemoteChange */ = this.watcher.identifyChange(
          remoteDoc,
          null,
          [],
          []
        )
        should(change.type).equal('FileAddition')
        should((change /*: any */).doc.incompatibilities).be.undefined()
      })
    })

    it('calls addDoc for a new doc', async function() {
      this.prep.addFileAsync = sinon.stub()
      this.prep.addFileAsync.resolves(null)
      let remoteDoc /*: RemoteDoc */ = {
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

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        null,
        [],
        []
      )

      should(change.type).equal('FileAddition')
      should(change.doc).have.properties({
        path: 'my-folder',
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: remoteDoc._id,
          _rev: remoteDoc._rev
        }
      })
      should(change.doc).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls updateDoc when tags are updated', async function() {
      this.prep.updateFileAsync = sinon.stub()
      this.prep.updateFileAsync.resolves(null)
      const filePath = path.join('my-folder', 'file-1')
      let remoteDoc /*: RemoteDoc */ = {
        _id: `1234567890-${filePath}`,
        _rev: '2-abcdef',
        _type: FILES_DOCTYPE,
        dir_id: '23456789012',
        type: 'file',
        path: '/my-folder/file-1',
        name: 'file-1',
        md5sum: `111111111111111111111111111111111111111${filePath}`,
        tags: ['foo', 'bar', 'baz'],
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        binary: {
          file: {
            id: '1234',
            rev: '5-6789'
          }
        }
      }
      const was = await this.pouch.byRemoteIdAsync(remoteDoc._id)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      should(change.type).equal('FileUpdate')
      should(change.doc).have.properties({
        path: filePath,
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: remoteDoc._id,
          _rev: remoteDoc._rev
        }
      })
    })

    it('calls updateDoc when content is overwritten', async function() {
      this.prep.updateFileAsync = sinon.stub()
      this.prep.updateFileAsync.resolves(null)
      const filePath = path.join('my-folder', 'file-1')
      let remoteDoc /*: RemoteDoc */ = {
        _id: `1234567890-${filePath}`,
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
      const was = await this.pouch.byRemoteIdAsync(remoteDoc._id)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      should(change.type).equal('FileUpdate')
      should(change.doc).have.properties({
        path: filePath,
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: remoteDoc._id,
          _rev: remoteDoc._rev
        }
      })
      should(change.doc).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveFile when file is renamed', async function() {
      this.prep.moveFileAsync = sinon.stub()
      this.prep.moveFileAsync.resolves(null)
      const filePath = path.join('my-folder', 'file-2')
      let remoteDoc /*: RemoteDoc */ = {
        _id: `1234567890-${filePath}`,
        _rev: '4-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        path: '/my-folder',
        name: 'file-2-bis',
        md5sum: `111111111111111111111111111111111111111${filePath}`,
        tags: [],
        updated_at: '2017-01-30T09:09:15.217662611+01:00'
      }

      const was = await this.pouch.byRemoteIdMaybeAsync(remoteDoc._id)
      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      should(change.type).equal('FileMove')
      // $FlowFixMe
      const src = change.was
      should(src).have.properties({
        path: filePath,
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: `1234567890-${filePath}`
        }
      })
      const dst = change.doc
      should(dst).have.properties({
        path: 'my-folder',
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: remoteDoc._id,
          _rev: remoteDoc._rev
        }
      })
      should(dst).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveFile when file is moved', async function() {
      this.prep.moveFileAsync = sinon.stub()
      this.prep.moveFileAsync.resolves(null)
      const filePath = path.join('my-folder', 'file-2')
      let remoteDoc /*: RemoteDoc */ = {
        _id: `1234567890-${filePath}`,
        _rev: '5-abcdef',
        _type: FILES_DOCTYPE,
        type: 'file',
        dir_id: 'whatever',
        path: '/another-folder/in/some/place',
        name: 'file-2-ter',
        md5sum: `111111111111111111111111111111111111111${filePath}`,
        tags: [],
        updated_at: '2017-01-30T09:09:15.217662611+01:00',
        binary: {
          file: {
            id: '4321',
            rev: '9-8765'
          }
        }
      }
      const was /*: Metadata */ = await this.pouch.db.get(metadata.id(filePath))
      await this.pouch.db.put(was)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      should(change.type).equal('FileMove')
      should(change).have.property('update', false)
      // $FlowFixMe
      const src = change.was
      should(src).have.properties({
        path: filePath,
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: `1234567890-${filePath}`
        }
      })
      const dst = change.doc
      should(dst).have.properties({
        path: path.normalize('another-folder/in/some/place'),
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: remoteDoc._id,
          _rev: remoteDoc._rev
        }
      })
      should(dst).not.have.properties(['_rev', 'path', 'name'])
    })

    it('detects when file was both moved and updated', async function() {
      const file /*: RemoteDoc */ = await builders
        .remoteFile()
        .name('meow.txt')
        .data('meow')
        .build()
      const was /*: Metadata */ = metadata.fromRemoteDoc(file)
      metadata.ensureValidPath(was)
      metadata.assignId(was)
      file._rev = '2'
      file.name = 'woof.txt'
      file.path = '/' + file.name
      file.md5sum = 'j9tggB6dOaUoaqAd0fT08w==' // woof

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(file),
        was,
        [],
        []
      )

      should(change).have.properties({
        type: 'FileMove',
        update: true
      })
      should(change)
        .have.propertyByPath('was', 'path')
        .eql(was.path)
      should(change)
        .have.propertyByPath('doc', 'path')
        .eql(file.name)
    })

    it('is invalid when local or remote file is corrupt', async function() {
      const remoteDoc /*: RemoteDoc */ = builders.remoteFile().build()
      const was /*: Metadata */ = metadata.fromRemoteDoc(remoteDoc)
      metadata.ensureValidPath(was)
      metadata.assignId(was)
      should(remoteDoc.md5sum).equal(was.md5sum)
      remoteDoc.size = '123'
      was.size = 456
      was.remote._rev = '0'

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      should(change).have.property('type', 'InvalidChange')
      // $FlowFixMe
      should(change.error).match(/corrupt/)
    })

    xit('calls deleteDoc & addDoc when trashed', async function() {
      this.prep.deleteFolderAsync = sinon.stub()
      this.prep.deleteFolderAsync.returnsPromise().resolves(null)
      this.prep.addFolderAsync = sinon.stub()
      this.prep.addFolderAsync.returnsPromise().resolves(null)
      const oldDir /*: RemoteDoc */ = builders
        .remoteDir()
        .name('foo')
        .build()
      const oldMeta /*: Metadata */ = await builders
        .metadir()
        .fromRemote(oldDir)
        .create()
      const newDir /*: RemoteDoc */ = builders
        .remoteDir(oldDir)
        .trashed()
        .build()

      this.watcher.identifyChange(newDir, null, [], [])

      should(this.prep.deleteFolderAsync.called).be.true()
      should(this.prep.addFolderAsync.called).be.true()
      const deleteArgs = this.prep.deleteFolderAsync.args[0]
      // FIXME: Make sure oldMeta timestamps are formatted as expected by PouchDB
      delete oldMeta.updated_at
      should(deleteArgs[0]).equal('remote')
      should(deleteArgs[1]).have.properties(oldMeta)
      const addArgs = this.prep.addFolderAsync.args[0]
      should(addArgs[0]).equal('remote')
      should(addArgs[1]).have.properties(metadata.fromRemoteDoc(newDir))
    })

    xit('calls deleteDoc & addDoc when restored', async function() {
      this.prep.deleteFolder = sinon.stub()
      this.prep.deleteFolder.returnsPromise().resolves(null)
      this.prep.addFolderAsync = sinon.stub()
      this.prep.addFolderAsync.returnsPromise().resolves(null)
      const oldDir /*: RemoteDoc */ = builders
        .remoteDir()
        .name('foo')
        .trashed()
        .build()
      const oldMeta /*: Metadata */ = await builders.metadir
        .fromRemote(oldDir)
        .create()
      const newDir /*: RemoteDoc */ = builders
        .remoteDir(oldDir)
        .restored()
        .build()

      this.watcher.identifyChange(newDir, null, [], [])

      should(this.prep.deleteFolder.called).be.true()
      should(this.prep.addFolderAsync.called).be.true()
      const deleteArgs = this.prep.deleteFolder.args[0]
      // FIXME: Make sure oldMeta timestamps are formatted as expected by PouchDB
      delete oldMeta.updated_at
      should(deleteArgs[0]).equal('remote')
      should(deleteArgs[1]).have.properties(oldMeta)
      const addArgs = this.prep.addFolderAsync.args[0]
      should(addArgs[0]).equal('remote')
      should(addArgs[1]).have.properties(metadata.fromRemoteDoc(newDir))
    })

    describe('restored file before trashing was synced', () => {
      it('returns a FileAddition', function() {
        const origFile = builders
          .remoteFile()
          .name('foo')
          .trashed()
          .shortRev(2)
          .build()
        const trashedFile = builders
          .metafile()
          .fromRemote(origFile)
          .deleted()
          .build()
        const newFile = builders
          .remoteFile(origFile)
          .restored()
          .shortRev(3)
          .build()

        should(
          this.watcher.identifyChange(newFile, trashedFile, [], [])
        ).have.properties({
          sideName: 'remote',
          type: 'FileAddition',
          doc: builders
            .metafile()
            .fromRemote(newFile)
            .build()
        })
      })
    })

    describe('added file', () => {
      let addedRemoteFile

      beforeEach(() => {
        addedRemoteFile = builders
          .remoteFile()
          .data('initial content')
          .shortRev(1)
          .build()
      })

      describe('updated', () => {
        let updatedRemoteFile

        beforeEach(() => {
          updatedRemoteFile = builders
            .remoteFile(addedRemoteFile)
            .shortRev(2)
            .data('updated content')
            .build()
        })

        describe('with the added version in the changesfeed', () => {
          let remoteDoc, was

          beforeEach('simulate race condition', () => {
            remoteDoc = addedRemoteFile
            was = builders
              .metafile()
              .fromRemote(updatedRemoteFile)
              .upToDate()
              .build()

            should(metadata.extractRevNumber(remoteDoc)).equal(1)
            should(metadata.extractRevNumber(was.remote)).equal(2)
          })

          it('assumes the file is up-to-date since remote rev number is lower', async function() {
            const change = this.watcher.identifyChange(remoteDoc, was, [], [])
            should(change.type).equal('UpToDate')
          })
        })
      })
    })
  })
})
