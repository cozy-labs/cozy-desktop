/* @flow */
/* eslint-env mocha */

const EventEmitter = require('events')
const path = require('path')

const { Promise } = require('bluebird')
const faker = require('faker')
const _ = require('lodash')
const should = require('should')
const sinon = require('sinon')

const metadata = require('../../../core/metadata')
const Prep = require('../../../core/prep')
const {
  FILE_TYPE,
  DIR_TYPE,
  HEARTBEAT: REMOTE_HEARTBEAT,
  INITIAL_SEQ,
  REMOTE_WATCHER_ERROR_EVENT,
  REMOTE_WATCHER_FATAL_EVENT
} = require('../../../core/remote/constants')
const { FetchError, RemoteCozy } = require('../../../core/remote/cozy')
const remoteErrors = require('../../../core/remote/errors')
const { RemoteWatcher } = require('../../../core/remote/watcher')
const timestamp = require('../../../core/utils/timestamp')
const configHelpers = require('../../support/helpers/config')
const { posixifyPath } = require('../../support/helpers/context_dir')
const { onPlatform, onPlatforms } = require('../../support/helpers/platform')
const pouchHelpers = require('../../support/helpers/pouch')
const { RemoteTestHelpers } = require('../../support/helpers/remote')

/*::
import type {
  RemoteChange,
  RemoteInvalidChange
} from '../../../core/remote/change'
import type {
  RemoteDoc,
  CouchDBDeletion,
  FullRemoteFile,
  RemoteDir
} from '../../../core/remote/document'
import type {
  Metadata,
  MetadataRemoteInfo,
  MetadataRemoteFile,
  MetadataRemoteDir
} from '../../../core/metadata'
import type { RemoteTree } from '../../support/helpers/remote'
*/

const isFile = (remoteFile) /*: boolean %checks */ =>
  remoteFile.type === FILE_TYPE
const isDir = (remoteDir) /*: boolean %checks */ => remoteDir.type === DIR_TYPE

const pathsToDocs = (
  paths /* string[] */,
  { dirs, files } /* RemoteTree */
) /*: Array<FullRemoteFile|RemoteDir> */ =>
  paths.map(p => {
    if (p[0].endsWith('/')) return dirs[p[0]]
    else return files[p[0]]
  })

const saveTree = async ({ dirs, files }, builders) => {
  for (const dirPath in dirs) {
    await builders
      .metadir()
      .fromRemote(dirs[dirPath])
      .upToDate()
      .create()
  }

  for (const filePath in files) {
    await builders
      .metafile()
      .fromRemote(files[filePath])
      .upToDate()
      .create()
  }
}

describe('RemoteWatcher', function() {
  let builders, clock, remoteHelpers
  let dirs, files

  before('instanciate config', configHelpers.createConfig)
  before('register client', configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach('instanciate helpers', function() {
    remoteHelpers = new RemoteTestHelpers(this)
    builders = remoteHelpers.builders
  })
  beforeEach(async function instanciateRemoteWatcher() {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })

    this.prep = sinon.createStubInstance(Prep)
    this.prep.config = this.config
    this.remoteCozy = new RemoteCozy(this.config)
    this.events = new EventEmitter()
    this.watcher = new RemoteWatcher(this)
  })
  beforeEach(async function() {
    const remoteTree = await builders.createRemoteTree([
      'my-folder/',
      'my-folder/folder-1/',
      'my-folder/folder-2/',
      'my-folder/folder-3/',
      'my-folder/file-1',
      'my-folder/file-2',
      'my-folder/file-3'
    ])
    dirs = remoteTree.dirs
    files = remoteTree.files

    // XXX: save remote tree in PouchDB
    await saveTree(remoteTree, builders)
  })

  afterEach(async function() {
    await this.watcher.stop()
  })
  afterEach(function removeEventListeners() {
    this.events.removeAllListeners()
  })
  afterEach(function restoreTimers() {
    clock.restore()
  })
  afterEach(async function() {
    await pouchHelpers.cleanDatabase()
  })
  afterEach(() => remoteHelpers.clean())
  after(configHelpers.cleanConfig)

  describe('start', function() {
    const fatalError = new remoteErrors.RemoteError({
      code: remoteErrors.OAUTH_CLIENT_REVOKED_CODE,
      message: remoteErrors.OAUTH_CLIENT_REVOKED_MESSAGE,
      err: new Error('from watch')
    })
    const nonFatalError = new Error('from watch')

    beforeEach(function() {
      sinon.stub(this.watcher, 'watch').resolves()
      sinon.spy(this.events, 'emit')
    })
    afterEach(function() {
      this.watcher.watch.restore()
      this.events.emit.restore()
    })

    it('starts the watch loop', async function() {
      const requestRunSpy = sinon.spy(this.watcher, 'requestRun')
      try {
        await this.watcher.start()
        should(requestRunSpy).have.been.calledOnce()
        should(this.watcher.running).be.true()
        await clock.tickAsync(REMOTE_HEARTBEAT)
        should(requestRunSpy).have.been.calledTwice()
      } finally {
        requestRunSpy.restore()
      }
    })

    it('can be called multiple times without resetting the clock', async function() {
      await this.watcher.start()
      const intervalID = this.watcher.watchInterval.ref()
      await this.watcher.start()
      should(this.watcher.running).be.true()
      should(this.watcher.watchInterval.ref()).eql(intervalID)
    })

    it('emits a REMOTE_WATCHER_FATAL_EVENT event on fatal error during first watch()', async function() {
      this.watcher.watch.rejects(fatalError)

      await this.watcher.start()
      should(this.events.emit).have.been.calledWith(
        REMOTE_WATCHER_FATAL_EVENT,
        fatalError
      )
    })

    it('emits a REMOTE_WATCHER_FATAL_EVENT event on fatal error during second watch()', async function() {
      this.watcher.watch
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .rejects(fatalError)

      await this.watcher.start()

      const done = new Promise(resolve => {
        this.events.once(REMOTE_WATCHER_FATAL_EVENT, () => {
          should(this.events.emit).have.been.calledWith(
            REMOTE_WATCHER_FATAL_EVENT,
            fatalError
          )
          resolve()
        })
      })
      await clock.tickAsync(REMOTE_HEARTBEAT)
      await done
    })

    it('emits a REMOTE_WATCHER_ERROR_EVENT event on non-fatal error during first watch()', async function() {
      this.watcher.watch.rejects(nonFatalError)

      await this.watcher.start()
      should(this.events.emit).have.been.calledWith(
        REMOTE_WATCHER_ERROR_EVENT,
        nonFatalError
      )
    })

    it('emits a REMOTE_WATCHER_ERROR_EVENT event on non-fatal error during second watch()', async function() {
      this.watcher.watch
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .rejects(nonFatalError)

      await this.watcher.start()

      const done = new Promise(resolve => {
        this.events.once(REMOTE_WATCHER_ERROR_EVENT, () => {
          should(this.events.emit).have.been.calledWith(
            REMOTE_WATCHER_ERROR_EVENT,
            nonFatalError
          )
          resolve()
        })
      })
      await clock.tickAsync(REMOTE_HEARTBEAT)
      await done
    })
  })

  describe('stop', function() {
    beforeEach(function() {
      sinon.stub(this.watcher, 'watch').resolves()
    })

    afterEach(function() {
      this.watcher.watch.restore()
    })

    it('ensures watch is not called anymore', async function() {
      await this.watcher.start()
      await this.watcher.stop()
      should(this.watcher.running).be.false()
      should(this.watcher.watchInterval).be.null()
    })

    it('can be called multiple times', async function() {
      await this.watcher.start()
      await this.watcher.stop()
      await this.watcher.stop()
      should(this.watcher.running).be.false()
      should(this.watcher.watchInterval).be.null()
    })
  })

  describe('watch loop', function() {
    it('requests run at REMOTE_HEARTBEAT interval only if the queue is idle', async function() {
      this.watcher.watch = sinon.stub().callsFake(async () => {
        await Promise.delay(REMOTE_HEARTBEAT + 1)
      })
      const requestRunSpy = sinon.spy(this.watcher, 'requestRun')

      try {
        this.watcher.running = true
        this.watcher.startClock()

        await clock.tickAsync(REMOTE_HEARTBEAT)
        should(this.watcher.requestRun).have.been.calledOnce()

        await clock.tickAsync(REMOTE_HEARTBEAT)
        should(this.watcher.requestRun).have.been.calledOnce()

        await clock.tickAsync(REMOTE_HEARTBEAT)
        should(this.watcher.requestRun).have.been.calledTwice()
      } finally {
        requestRunSpy.restore()
      }
    })
  })

  describe('requestRun', function() {
    beforeEach(async function() {
      sinon.stub(this.watcher, 'watch')
      sinon.spy(this.events, 'emit')

      this.watcher.watch.resolves()
      await this.watcher.start()
      this.watcher.watch.resetHistory()
    })

    afterEach(async function() {
      this.events.emit.restore()
      this.watcher.watch.restore()
      await this.watcher.stop()
    })

    it('clears enqueued watch runs', async function() {
      this.watcher.watch.resolves()

      // We start with an empty queue
      should(this.watcher.queue.length()).equal(0)

      // Adding a bunch of run requests
      const runs = [this.watcher.requestRun()]
      // Wait for the first task execution to start
      await new Promise(resolve => process.nextTick(resolve))
      runs.push(
        this.watcher.requestRun(),
        this.watcher.requestRun(),
        this.watcher.requestRun(),
        this.watcher.requestRun()
      )

      // We only keep one request in the queue
      should(this.watcher.queue.length()).equal(1)

      // Wait until all tasks have been executed
      await this.watcher.queue.drain()

      // Make sure all run requests are fulfilled
      await Promise.all(runs)

      // And we only called watch twice
      should(this.watcher.watch).have.been.calledTwice()
    })

    context('when the watcher is stopped', () => {
      beforeEach(function() {
        this.watcher.running = false
      })

      it('does not call watch()', async function() {
        await this.watcher.requestRun()
        should(this.watcher.watch).not.have.been.called()
      })
    })

    context('on error while calling watch', () => {
      const randomMessage = faker.random.words
      let err

      context('when next #watch() has no chance to work anymore', () => {
        beforeEach(function() {
          err = new remoteErrors.RemoteError({
            code: remoteErrors.OAUTH_CLIENT_REVOKED_CODE,
            message: remoteErrors.OAUTH_CLIENT_REVOKED_MESSAGE,
            err: new FetchError({ status: 400 }, randomMessage())
          })
          this.watcher.watch.rejects(err)
        })

        it('stops the watcher', async function() {
          await this.watcher.requestRun()
          should(this.watcher.running).be.false()
        })

        it('emits a REMOTE_WATCHER_FATAL_EVENT event', async function() {
          await this.watcher.requestRun()
          await should(this.events.emit).have.been.calledWith(
            REMOTE_WATCHER_FATAL_EVENT,
            err
          )
        })
      })

      context('when next #watch() could work', () => {
        beforeEach(function() {
          err = new remoteErrors.RemoteError({
            code: remoteErrors.UNREACHABLE_COZY_CODE,
            message: 'Cannot reach remote Cozy',
            err: new FetchError({ status: 500 }, randomMessage())
          })
          this.watcher.watch.rejects(err)
        })

        it('does not stop the watcher', async function() {
          await this.watcher.requestRun()
          should(this.watcher.running).be.true()
        })

        it('emits a REMOTE_WATCHER_ERROR_EVENT event', async function() {
          await this.watcher.requestRun()
          await should(this.events.emit).have.been.calledWith(
            REMOTE_WATCHER_ERROR_EVENT,
            err
          )
        })
      })
    })
  })

  describe('watch', function() {
    const lastLocalSeq = '123'
    const lastRemoteSeq = lastLocalSeq + '456'

    let changes
    beforeEach(function() {
      changes = {
        isInitialFetch: false,
        last_seq: String(Number(lastRemoteSeq) + 2), // XXX: Include the two changes returned
        docs: [builders.remoteFile().build(), builders.remoteDir().build()]
      }
    })

    beforeEach(function() {
      sinon.stub(this.pouch, 'getRemoteSeq')
      sinon.stub(this.pouch, 'setRemoteSeq')
      sinon.stub(this.watcher, 'processRemoteChanges')
      sinon.stub(this.remoteCozy, 'changes')
      sinon.spy(this.events, 'emit')

      this.pouch.getRemoteSeq.resolves(lastLocalSeq)
      this.watcher.running = true
      this.watcher.processRemoteChanges.resolves([])
      this.remoteCozy.changes.resolves(changes)
    })

    afterEach(function() {
      this.events.emit.restore()
      this.remoteCozy.changes.restore()
      this.watcher.processRemoteChanges.restore()
      this.watcher.running = false
      this.pouch.setRemoteSeq.restore()
      this.pouch.getRemoteSeq.restore()
    })

    it('pulls the changed files/dirs', async function() {
      await this.watcher.watch()
      should(this.watcher.processRemoteChanges)
        .have.been.calledOnce()
        .and.be.calledWithExactly(changes.docs)
    })

    it('updates the last update sequence in local db', async function() {
      await this.watcher.watch()
      should(this.pouch.setRemoteSeq)
        .have.been.calledOnce()
        .and.be.calledWithExactly(changes.last_seq)
    })

    context('on error while fetching changes', () => {
      const randomMessage = faker.random.words
      let err

      beforeEach(function() {
        const response = {}
        // FetchError objects defined in `cozy-stack-client` have the same
        // signature as FetchError objects defined in `cozy-client-js`.
        err = new FetchError(response, randomMessage())
        this.remoteCozy.changes.rejects(err)
      })

      it('resolves with a higher-level error', async function() {
        err.status = 400 // Revoked
        await should(this.watcher.watch()).be.rejectedWith(
          new remoteErrors.RemoteError({
            code: remoteErrors.OAUTH_CLIENT_REVOKED_CODE,
            message: remoteErrors.OAUTH_CLIENT_REVOKED_MESSAGE,
            err
          })
        )

        err.status = 500 // Possibly temporary error
        await should(this.watcher.watch()).be.rejectedWith(
          new remoteErrors.RemoteError({
            code: remoteErrors.UNKNOWN_REMOTE_ERROR_CODE,
            message:
              'The Twake Workplace failed to process the request for an unknown reason',
            err
          })
        )
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
        this.watcher.processRemoteChanges.throws(reservedIdsError)
      })

      it('does not return client revoked error', async function() {
        await should(this.watcher.watch()).be.rejectedWith({
          code: remoteErrors.UNKNOWN_REMOTE_ERROR_CODE
        })
      })
    })

    context('when a fetched directory has been modified more than once', () => {
      beforeEach(function() {
        this.prep.putFolderAsync.callsFake(async (side, doc) => {
          metadata.markSide(side, doc, doc)
          await this.pouch.put(doc)
        })
      })
      afterEach(function() {
        this.prep.putFolderAsync.restore()
      })

      it('it fetches its content as a potentially re-included directory', async function() {
        const remoteDocs = [
          builders.remoteFile().build(),
          builders
            .remoteDir()
            .shortRev(3) // XXX: this folder has already been modified twice on the Cozy
            .build()
        ]

        // Restored in a "parent" afterEach
        this.remoteCozy.changes.resolves({
          isInitialFetch: false,
          last_seq: String(Number(lastRemoteSeq) + remoteDocs.length),
          docs: remoteDocs
        })
        // Restore the original processRemoteChanges function which is stubbed in beforeEach
        this.watcher.processRemoteChanges.restore()
        // Create a new stub (which calls the original method though) so the
        // restore() call in afterEach succeeds.
        sinon.stub(this.watcher, 'processRemoteChanges').callThrough()

        const spy = sinon.spy(this.remoteCozy, 'getDirectoryContent')
        try {
          await this.watcher.watch()
          should(spy)
            .have.been.calledOnce()
            .and.calledWith(remoteDocs[1])
        } finally {
          spy.restore()
        }
      })

      context('when fetching changes for the first time', () => {
        it('does not fetch the content of modified directories', async function() {
          // Restored in a "parent" afterEach
          this.pouch.getRemoteSeq.resolves(INITIAL_SEQ)
          // Restored in a "parent" afterEach
          this.remoteCozy.changes.resolves({
            isInitialFetch: true,
            last_seq: String(Number(INITIAL_SEQ) + 2),
            docs: [
              builders.remoteFile().build(),
              builders
                .remoteDir()
                .shortRev(3) // XXX: this folder has already been modified twice on the Cozy
                .build()
            ]
          })
          // Restore the original processRemoteChanges function which is stubbed in beforeEach
          this.watcher.processRemoteChanges.restore()
          // Create a new stub (which calls the original method though) so the
          // restore() call in afterEach succeeds.
          sinon.stub(this.watcher, 'processRemoteChanges').callThrough()

          const spy = sinon.spy(this.remoteCozy, 'getDirectoryContent')
          try {
            await this.watcher.watch()
            should(this.remoteCozy.getDirectoryContent).have.not.been.called()
          } finally {
            spy.restore()
          }
        })
      })
    })

    context('when watcher is not running', () => {
      beforeEach(function() {
        this.watcher.running = false
      })

      afterEach(function() {
        this.watcher.running = true
      })

      it('returns without fetching changes', async function() {
        await this.watcher.watch()

        should(this.remoteCozy.changes).not.have.been.called()
      })

      it('still tries to get hold of the PouchDB lock', async function() {
        sinon.spy(this.pouch, 'lock')

        try {
          await this.watcher.watch()

          should(this.pouch.lock).have.been.calledOnce()
        } finally {
          this.pouch.lock.restore()
        }
      })
    })
  })

  const validMetadata = (
    remoteDoc /*: FullRemoteFile|RemoteDir */
  ) /*: Metadata */ => {
    const doc = metadata.fromRemoteDoc(remoteDoc)
    metadata.ensureValidPath(doc)
    return doc
  }

  describe('processRemoteChanges', function() {
    let apply
    let findMaybe
    let remoteDocs
    beforeEach(function() {
      apply = sinon.stub(this.watcher, 'apply')
      findMaybe = sinon.stub(this.remoteCozy, 'findMaybe')
      remoteDocs = [
        builders.remoteFile().build(),
        builders.remoteErased().build()
      ]
    })

    afterEach(function() {
      apply.restore()
      findMaybe.restore()
    })

    it('pulls many changed files/dirs given their ids', async function() {
      apply.resolves()

      await this.watcher.processRemoteChanges(remoteDocs, {
        isInitialFetch: false
      })

      apply.callCount.should.equal(2)
      // Changes are sorted before applying (first one was given Metadata since
      // it is valid while the second one got the original CouchDBDeletion since
      // it is ignored)
      should(apply.args[0][0].doc).deepEqual(validMetadata(remoteDocs[0]))
      should(apply.args[1][0].doc).deepEqual(remoteDocs[1])
    })

    context('when apply() returns an error for some file/dir', function() {
      beforeEach(function() {
        apply.callsFake(async (
          change /*: RemoteChange */
        ) /*: Promise<?{ change: RemoteChange, err: Error }> */ => {
          if (change.type === 'FileAddition')
            return { change, err: new Error(change.doc) }
        })
      })

      it('rejects with the first error', async function() {
        await should(
          this.watcher.processRemoteChanges(remoteDocs, {
            isInitialFetch: false
          })
        ).be.rejectedWith(new Error(remoteDocs[0]))
      })

      it('still tries to pull other files/dirs', async function() {
        await this.watcher
          .processRemoteChanges(remoteDocs, { isInitialFetch: false })
          .catch(() => {})
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
          builders.remoteErased().build(),
          builders.remoteFile().build()
        ]
        await this.watcher
          .processRemoteChanges(remoteDocs, { isInitialFetch: false })
          .catch(() => {})
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
        await this.watcher
          .processRemoteChanges(remoteDocs, { isInitialFetch: false })
          .catch(() => {})
        const nextLockPromise = this.pouch.lock('nextLock')
        await should(nextLockPromise).be.fulfilled()
      })

      it('does not update the remote sequence', async function() {
        const remoteSeq = await this.pouch.getRemoteSeq()
        await this.watcher
          .processRemoteChanges(remoteDocs, { isInitialFetch: false })
          .catch(() => {})
        should(this.pouch.getRemoteSeq()).be.fulfilledWith(remoteSeq)
      })
    })

    it('applies the changes when the document still exists on remote', async function() {
      const remoteDoc = builders
        .remoteFile()
        .name('whatever')
        .build()

      await this.watcher.processRemoteChanges([remoteDoc], {
        isInitialFetch: false
      })

      should(apply).be.calledOnce()
      should(apply.args[0][0].doc).deepEqual(validMetadata(remoteDoc))
    })

    it('tries to apply a deletion otherwise', async function() {
      const remoteDeletion /*: CouchDBDeletion */ = {
        _id: 'missing',
        _rev: 'whatever',
        _deleted: true
      }

      await this.watcher.processRemoteChanges([remoteDeletion], {
        isInitialFetch: false
      })

      should(apply).be.calledOnce()
      should(apply.args[0][0].doc).deepEqual(remoteDeletion)
    })
  })

  describe('analyse', () => {
    describe('case-only renaming', () => {
      it('is identified as a move', async function() {
        const oldRemote = builders
          .remoteFile()
          .name('foo')
          .build()
        const oldDoc = metadata.fromRemoteDoc(oldRemote)
        metadata.ensureValidPath(oldDoc)
        const newRemote = _.defaults(
          {
            _rev: oldRemote._rev.replace(/^1/, '2'),
            name: 'FOO',
            path: '/FOO'
          },
          oldRemote
        )

        const changes = await this.watcher.analyse([newRemote], [oldDoc])

        should(changes.map(c => c.type)).deepEqual(['FileMove'])
        should(changes[0])
          .have.propertyByPath('doc', 'path')
          .eql('FOO')
        should(changes[0])
          .have.propertyByPath('was', 'path')
          .eql('foo')
      })
    })

    onPlatform('darwin', () => {
      describe('file update', () => {
        context('at root with normalization change', () => {
          it('is not identified as a move', async function() {
            const oldRemote = builders
              .remoteFile()
              .name('énoncé'.normalize('NFC'))
              .build()
            const oldDoc = await builders
              .metafile()
              .fromRemote(oldRemote)
              .upToDate()
              .create()

            const newRemote = builders
              .remoteFile(oldRemote)
              .name(oldRemote.name.normalize('NFD'))
              .shortRev(2)
              .build()

            const [change] = await this.watcher.analyse([newRemote], [oldDoc])

            should(change).have.property('type', 'FileUpdate')
            should(change.doc).have.property('path', oldDoc.path)
          })
        })

        context('in accented folder with normalization change', () => {
          it('is not identified as a move', async function() {
            const oldRemoteDir = builders
              .remoteDir()
              .name('énoncés'.normalize('NFD'))
              .build()
            const oldDir = await builders
              .metadir()
              .fromRemote(oldRemoteDir)
              .upToDate()
              .create()
            const oldRemoteFile = builders
              .remoteFile()
              .inDir(oldRemoteDir)
              .name('file')
              .build()
            const oldFile = await builders
              .metafile()
              .fromRemote(oldRemoteFile)
              .upToDate()
              .create()

            const newRemoteDir = builders
              .remoteDir(oldRemoteDir)
              .name(oldRemoteDir.name.normalize('NFC'))
              .shortRev(2)
              .build()
            const newRemoteFile = builders
              .remoteFile(oldRemoteFile)
              .inDir(newRemoteDir)
              .shortRev(2)
              .build()

            const [dirChange, fileChange] = await this.watcher.analyse(
              [newRemoteDir, newRemoteFile],
              [oldDir, oldFile]
            )

            should(dirChange).have.property('type', 'DirUpdate')
            should(dirChange.doc).have.property('path', oldDir.path)
            should(fileChange).have.property('type', 'FileUpdate')
            should(fileChange.doc).have.property('path', oldFile.path)
          })
        })

        context(
          'in accented folder with different local/remote normalizations',
          () => {
            it('is not identified as a move', async function() {
              const oldRemoteDir = builders
                .remoteDir()
                .name('énoncés'.normalize('NFC'))
                .build()
              const oldDir = await builders
                .metadir()
                .fromRemote(oldRemoteDir)
                .path(oldRemoteDir.path.normalize('NFD'))
                .upToDate()
                .create()
              const oldRemoteFile = builders
                .remoteFile()
                .inDir(oldRemoteDir)
                .name('file')
                .build()
              const oldFile = await builders
                .metafile()
                .fromRemote(oldRemoteFile)
                .path(path.join(oldDir.path, oldRemoteFile.name))
                .upToDate()
                .create()

              const newRemoteFile = builders
                .remoteFile(oldRemoteFile)
                .data('new remote content')
                .shortRev(metadata.extractRevNumber(oldFile.remote) + 1)
                .build()

              const [fileChange] = await this.watcher.analyse(
                [newRemoteFile],
                [oldFile]
              )

              should(fileChange).have.property('type', 'FileUpdate')
              should(fileChange.doc).have.property('path', oldFile.path)
            })
          }
        )

        context(
          'in renamed accented folder with different local/remote normalizations',
          () => {
            it('is identified as a descendant change within current parent path', async function() {
              const oldRemoteDir = builders
                .remoteDir()
                .name('énoncés'.normalize('NFC'))
                .build()
              const oldDir = await builders
                .metadir()
                .fromRemote(oldRemoteDir)
                .path(oldRemoteDir.path.normalize('NFD'))
                .upToDate()
                .create()
              const oldRemoteFile = builders
                .remoteFile()
                .inDir(oldRemoteDir)
                .name('file')
                .build()
              const oldFile = await builders
                .metafile()
                .fromRemote(oldRemoteFile)
                .path(path.join(oldDir.path, oldRemoteFile.name))
                .upToDate()
                .create()

              const newRemoteDir = builders
                .remoteDir(oldRemoteDir)
                .name('corrigés'.normalize('NFC'))
                .shortRev(metadata.extractRevNumber(oldDir.remote) + 1)
                .build()
              const newRemoteFile = builders
                .remoteFile(oldRemoteFile)
                .inDir(newRemoteDir)
                .shortRev(metadata.extractRevNumber(oldFile.remote) + 1)
                .build()

              const [dirChange, fileChange] = await this.watcher.analyse(
                [newRemoteDir, newRemoteFile],
                [oldDir, oldFile]
              )

              const oldDirName = path.basename(oldDir.path)

              should(dirChange).have.property('type', 'DirMove')
              should(dirChange.doc).have.property(
                'path',
                oldDir.path.replace(oldDirName, newRemoteDir.name)
              )
              should(fileChange).have.property('type', 'DescendantChange')
              should(fileChange.doc).have.property(
                'path',
                oldFile.path.replace(oldDirName, newRemoteDir.name)
              )
            })
          }
        )
      })

      describe('file addition', () => {
        context(
          'in accented folder with different local/remote normalizations',
          () => {
            it('is identified as an addition with old parent normalization', async function() {
              const oldRemoteDir = builders
                .remoteDir()
                .name('énoncés'.normalize('NFC'))
                .build()
              const oldDir = await builders
                .metadir()
                .fromRemote(oldRemoteDir)
                .path(oldRemoteDir.path.normalize('NFD'))
                .upToDate()
                .create()

              const newRemoteFile = builders
                .remoteFile()
                .inDir(oldRemoteDir)
                .name('file')
                .build()

              const [fileChange] = await this.watcher.analyse(
                [newRemoteFile],
                []
              )

              should(fileChange).have.property('type', 'FileAddition')
              should(fileChange.doc).have.property(
                'path',
                path.join(oldDir.path, newRemoteFile.name)
              )
            })
          }
        )

        context(
          'in created folder in accented folder with different local/remote normalizations',
          () => {
            it('is identified as an addition with old ancestor normalization', async function() {
              const remoteParentDir = builders
                .remoteDir()
                .name('énoncés'.normalize('NFC'))
                .build()
              const parentDir = await builders
                .metadir()
                .fromRemote(remoteParentDir)
                .path(remoteParentDir.path.normalize('NFD'))
                .upToDate()
                .create()

              const newRemoteDir = builders
                .remoteDir()
                .inDir(remoteParentDir)
                .name('algèbre'.normalize('NFC'))
                .build()
              const newRemoteFile = builders
                .remoteFile()
                .inDir(newRemoteDir)
                .name('file')
                .build()

              const [dirChange, fileChange] = await this.watcher.analyse(
                [newRemoteDir, newRemoteFile],
                []
              )

              should(dirChange).have.property('type', 'DirAddition')
              should(dirChange.doc).have.property(
                'path',
                path.join(parentDir.path, newRemoteDir.name)
              )
              should(fileChange).have.property('type', 'FileAddition')
              should(fileChange.doc).have.property(
                'path',
                path.join(parentDir.path, newRemoteDir.name, newRemoteFile.name)
              )
            })

            context(
              'with the folder creation ordered after the file creation',
              () => {
                it('is identified as an addition with old ancestor normalization', async function() {
                  const remoteParentDir = builders
                    .remoteDir()
                    .name('énoncés'.normalize('NFC'))
                    .build()
                  const parentDir = await builders
                    .metadir()
                    .fromRemote(remoteParentDir)
                    .path(remoteParentDir.path.normalize('NFD'))
                    .upToDate()
                    .create()

                  const newRemoteDir = builders
                    .remoteDir()
                    .inDir(remoteParentDir)
                    .name('algèbre'.normalize('NFC'))
                    .build()
                  const newRemoteFile = builders
                    .remoteFile()
                    .inDir(newRemoteDir)
                    .name('file')
                    .build()

                  const [dirChange, fileChange] = await this.watcher.analyse(
                    [newRemoteFile, newRemoteDir],
                    []
                  )

                  should(dirChange).have.property('type', 'DirAddition')
                  should(dirChange.doc).have.property(
                    'path',
                    path.join(parentDir.path, newRemoteDir.name)
                  )
                  should(fileChange).have.property('type', 'FileAddition')
                  should(fileChange.doc).have.property(
                    'path',
                    path.join(
                      parentDir.path,
                      newRemoteDir.name,
                      newRemoteFile.name
                    )
                  )
                })
              }
            )
          }
        )
      })

      describe('file move', () => {
        context(
          'with different local/remote normalizations to accented folder with different local/remote normalizations',
          () => {
            it('is identified as move with old normalization and new parent normalization', async function() {
              const oldRemoteDir = builders
                .remoteDir()
                .name('énoncés'.normalize('NFC'))
                .build()
              const oldDir = await builders
                .metadir()
                .fromRemote(oldRemoteDir)
                .path(oldRemoteDir.path.normalize('NFD'))
                .upToDate()
                .create()
              const newRemoteDir = builders
                .remoteDir()
                .name('corrigés'.normalize('NFC'))
                .build()
              const newDir = await builders
                .metadir()
                .fromRemote(newRemoteDir)
                .path(newRemoteDir.path.normalize('NFD'))
                .upToDate()
                .create()
              const oldRemoteFile = builders
                .remoteFile()
                .inDir(oldRemoteDir)
                .name('éssai 1.txt')
                .build()
              const oldFile = await builders
                .metafile()
                .fromRemote(oldRemoteFile)
                .path(oldRemoteFile.path.normalize('NFD'))
                .upToDate()
                .create()

              const newRemoteFile = builders
                .remoteFile(oldRemoteFile)
                .inDir(newRemoteDir)
                .shortRev(metadata.extractRevNumber(oldFile.remote) + 1)
                .build()

              const [fileChange] = await this.watcher.analyse(
                [newRemoteFile],
                [oldFile]
              )

              should(fileChange).have.property('type', 'FileMove')
              should(fileChange.doc).have.property(
                'path',
                oldFile.path.replace(oldDir.path, newDir.path)
              )
            })
          }
        )
      })
    })

    describe('file move overwriting trashed destination', () => {
      let srcFileDoc, dstFileDoc, olds, srcFileMoved, dstFileTrashed

      beforeEach(() => {
        const { dirs, files } = builders.buildRemoteTree([
          'dst/',
          'dst/file',
          'src/',
          'src/file'
        ])

        /* Files were synced */
        srcFileDoc = builders
          .metafile()
          .fromRemote(files['src/file'])
          .upToDate()
          .build()
        dstFileDoc = builders
          .metafile()
          .fromRemote(files['dst/file'])
          .upToDate()
          .build()
        olds = [srcFileDoc, dstFileDoc]

        /* Moving /src/file to /dst/file (overwriting the destination) */
        srcFileMoved = isFile(files['src/file'])
          ? builders
              .remoteFile(files['src/file'])
              .shortRev(2)
              .inDir(dirs['dst/'])
              .build()
          : undefined
        dstFileTrashed = isFile(files['dst/file'])
          ? builders
              .remoteFile(files['dst/file'])
              .shortRev(2)
              .trashed()
              .build()
          : undefined
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

      it('is detected when moved source is first', async function() {
        const remoteDocs = [srcFileMoved, dstFileTrashed]
        const changes = await this.watcher.analyse(remoteDocs, olds)
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

      it('is detected when trashed destination is first', async function() {
        const remoteDocs = [dstFileTrashed, srcFileMoved]
        const changes = await this.watcher.analyse(remoteDocs, olds)
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
        const { dirs, files } = builders.buildRemoteTree([
          'dst/',
          'dst/FILE',
          'src/',
          'src/file'
        ])

        /* Files were synced */
        srcFileDoc = builders
          .metafile()
          .fromRemote(files['src/file'])
          .upToDate()
          .build()
        dstFileDoc = builders
          .metafile()
          .fromRemote(files['dst/FILE'])
          .upToDate()
          .build()
        olds = [srcFileDoc, dstFileDoc]

        /* Moving /src/file to /dst/file (overwriting the destination) */
        srcFileMoved = isFile(files['src/file'])
          ? builders
              .remoteFile(files['src/file'])
              .shortRev(2)
              .inDir(dirs['dst/'])
              .build()
          : undefined
        dstFileTrashed = isFile(files['dst/FILE'])
          ? builders
              .remoteFile(files['dst/FILE'])
              .shortRev(2)
              .trashed()
              .build()
          : undefined
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
          it('sorts the trashing before the move to prevent id confusion', async function() {
            const remoteDocs = [srcFileMoved, dstFileTrashed]
            const changes = await this.watcher.analyse(remoteDocs, olds)
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
          it('sorts the move before the trashing', async function() {
            const remoteDocs = [srcFileMoved, dstFileTrashed]
            const changes = await this.watcher.analyse(remoteDocs, olds)
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
          it('sorts the trashing before the move to prevent id confusion', async function() {
            const remoteDocs = [dstFileTrashed, srcFileMoved]
            const changes = await this.watcher.analyse(remoteDocs, olds)
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
          it('sorts the move before the trashing', async function() {
            const remoteDocs = [dstFileTrashed, srcFileMoved]
            const changes = await this.watcher.analyse(remoteDocs, olds)
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
        const { dirs } = builders.buildRemoteTree([
          'dst/',
          'dst/dir/',
          'src/',
          'src/dir/'
        ])

        /* Directories were synced */
        srcDoc = builders
          .metadir()
          .fromRemote(dirs['src/dir/'])
          .upToDate()
          .build()
        dstDoc = builders
          .metadir()
          .fromRemote(dirs['dst/dir/'])
          .upToDate()
          .build()
        olds = [srcDoc, dstDoc]

        /* Moving /src/dir to /dst/dir (overwriting the destination) */
        srcMoved = isDir(dirs['src/dir/'])
          ? builders
              .remoteDir(dirs['src/dir/'])
              .shortRev(2)
              .inDir(dirs['dst/'])
              .build()
          : undefined
        dstTrashed = isDir(dirs['dst/dir/'])
          ? builders
              .remoteDir(dirs['dst/dir/'])
              .shortRev(2)
              .trashed()
              .build()
          : undefined
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

      it('is detected when moved source is first', async function() {
        const remoteDocs = [srcMoved, dstTrashed]
        const changes = await this.watcher.analyse(remoteDocs, olds)
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

      it('is detected when trashed destination is first', async function() {
        const remoteDocs = [dstTrashed, srcMoved]
        const changes = await this.watcher.analyse(remoteDocs, olds)
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
        const { dirs } = builders.buildRemoteTree([
          'dst/',
          'dst/DIR/',
          'src/',
          'src/dir/'
        ])

        /* Directories were synced */
        srcDoc = builders
          .metadir()
          .fromRemote(dirs['src/dir/'])
          .upToDate()
          .build()
        dstDoc = builders
          .metadir()
          .fromRemote(dirs['dst/DIR/'])
          .upToDate()
          .build()
        olds = [srcDoc, dstDoc]

        /* Moving /src/dir to /dst/dir (overwriting the destination) */
        srcMoved = isDir(dirs['src/dir/'])
          ? builders
              .remoteDir(dirs['src/dir/'])
              .shortRev(2)
              .inDir(dirs['dst/'])
              .build()
          : undefined
        dstTrashed = isDir(dirs['dst/DIR/'])
          ? builders
              .remoteDir(dirs['dst/DIR/'])
              .shortRev(2)
              .trashed()
              .build()
          : undefined
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
          it('sorts the trashing before the move to prevent id confusion', async function() {
            const remoteDocs = [srcMoved, dstTrashed]
            const changes = await this.watcher.analyse(remoteDocs, olds)
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
          it('sorts the trashing before the move ', async function() {
            const remoteDocs = [srcMoved, dstTrashed]
            const changes = await this.watcher.analyse(remoteDocs, olds)
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
          it('sorts the trashing before the move to prevent id confusion', async function() {
            const remoteDocs = [dstTrashed, srcMoved]
            const changes = await this.watcher.analyse(remoteDocs, olds)
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
          it('sorts the trashing before the move', async function() {
            const remoteDocs = [dstTrashed, srcMoved]
            const changes = await this.watcher.analyse(remoteDocs, olds)
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
      it('handles correctly descendantMoves', async function() {
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

        const movedSubsubdir = {
          type: 'DescendantChange',
          oldPath: path.normalize('src/parent/child'),
          path: path.normalize('dst/parent/child'),
          ancestorPath: path.normalize('dst/parent'),
          descendantMoves: []
        }
        const movedSubdir = {
          type: 'DescendantChange',
          oldPath: path.normalize('src/parent'),
          path: path.normalize('dst/parent'),
          ancestorPath: 'dst',
          descendantMoves: []
        }
        const movedDir = {
          type: 'DirMove',
          oldPath: 'src',
          path: 'dst',
          ancestorPath: undefined,
          descendantMoves: [movedSubdir, movedSubsubdir]
        }

        const mapChange = change => ({
          type: change.type,
          oldPath: change.was.path,
          path: change.doc.path,
          ancestorPath: change.ancestor && change.ancestor.doc.path,
          descendantMoves: change.descendantMoves.map(mapChange)
        })
        const shouldBeExpected = result => {
          result.should.have.length(3)
          result
            .map(mapChange)
            .sort(({ path: pathA }, { path: pathB }) => {
              return pathA < pathB ? -1 : pathA > pathB ? 1 : 0
            })
            .should.deepEqual([movedDir, movedSubdir, movedSubsubdir])
        }

        shouldBeExpected(
          await this.watcher.analyse(
            [
              updated(remoteFile, { path: '/dst/parent/child' }),
              updated(remoteDir2, { path: '/dst/parent' }),
              updated(remoteDir1, { name: 'dst', path: '/dst' })
            ],
            olds
          )
        )

        shouldBeExpected(
          await this.watcher.analyse(
            [
              updated(remoteDir1, { name: 'dst', path: '/dst' }),
              updated(remoteDir2, { path: '/dst/parent' }),
              updated(remoteFile, { path: '/dst/parent/child' })
            ],
            olds
          )
        )

        shouldBeExpected(
          await this.watcher.analyse(
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
      const { dirs, files } = builders.buildRemoteTree(remotePaths)
      const remoteDocs = pathsToDocs(remotePaths, { dirs, files })
      const olds = [
        builders
          .metadir()
          .fromRemote(dirs['parent/'])
          .path('parent')
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst/'])
          .path(path.normalize('parent/dst'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/src/'])
          .path(path.normalize('parent/src'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst/dir/'])
          .path(path.normalize('parent/src/dir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst/dir/empty-subdir/'])
          .path(path.normalize('parent/src/dir/empty-subdir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst/dir/subdir/'])
          .path(path.normalize('parent/src/dir/subdir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(files['parent/dst/dir/subdir/filerenamed'])
          .path(path.normalize('parent/src/dir/subdir/file'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(files['parent/dst/dir/subdir/filerenamed2'])
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
      const { dirs, files } = builders.buildRemoteTree(remotePaths)
      const remoteDocs = pathsToDocs(remotePaths, { dirs, files })
      const olds = [
        builders
          .metadir()
          .fromRemote(dirs['parent/'])
          .path('parent')
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst/'])
          .path(path.normalize('parent/dst'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst2/'])
          .path(path.normalize('parent/dst2'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/src/'])
          .path(path.normalize('parent/src'))
          .upToDate()
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst/dir/'])
          .path(path.normalize('parent/src/dir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst/dir/empty-subdir/'])
          .path(path.normalize('parent/src/dir/empty-subdir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(dirs['parent/dst2/subdir/'])
          .path(path.normalize('parent/src/dir/subdir'))
          .upToDate()
          .remoteRev(1)
          .build(),
        builders
          .metadir()
          .fromRemote(files['parent/dst2/subdir/file'])
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

      let dirs, files, olds
      beforeEach('build changes', () => {
        const remoteDocsByPath = builders.buildRemoteTree(remotePaths)
        dirs = remoteDocsByPath.dirs
        files = remoteDocsByPath.files
        olds = [
          builders
            .metadir()
            .fromRemote(dirs['parent/'])
            .path('parent')
            .upToDate()
            .build(),
          builders
            .metadir()
            .fromRemote(dirs['parent/dst/'])
            .path(path.normalize('parent/src'))
            .upToDate()
            .remoteRev(1)
            .build(),
          builders
            .metadir()
            .fromRemote(dirs['parent/dst/dir2/'])
            .path(path.normalize('parent/src/dir'))
            .upToDate()
            .remoteRev(1)
            .build(),
          builders
            .metadir()
            .fromRemote(dirs['parent/dst/dir2/empty-subdir/'])
            .path(path.normalize('parent/src/dir/empty-subdir'))
            .upToDate()
            .remoteRev(1)
            .build(),
          builders
            .metadir()
            .fromRemote(dirs['parent/dst/dir2/subdir/'])
            .path(path.normalize('parent/src/dir/subdir'))
            .upToDate()
            .remoteRev(1)
            .build(),
          builders
            .metadir()
            .fromRemote(files['parent/dst/dir2/subdir/file2'])
            .path(path.normalize('parent/src/dir/subdir/file'))
            .upToDate()
            .remoteRev(1)
            .build()
        ]
      })

      it('sorts correctly order1', function() {
        const order1 = [
          dirs['parent/dst/dir2/'],
          dirs['parent/dst/'],
          dirs['parent/dst/dir2/empty-subdir/'],
          files['parent/dst/dir2/subdir/file2'],
          dirs['parent/dst/dir2/subdir/']
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
          dirs['parent/dst/dir2/subdir/'],
          dirs['parent/dst/'],
          dirs['parent/dst/dir2/'],
          files['parent/dst/dir2/subdir/file2'],
          dirs['parent/dst/dir2/empty-subdir/']
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
      const remoteDoc = builders
        .remoteFile()
        .name('whatever')
        .build()
      remoteDoc.path = ''

      const change /*: RemoteInvalidChange */ = this.watcher.identifyChange(
        remoteDoc,
        null,
        [],
        []
      )
      should(change.type).equal('InvalidChange')
      should(change.error.message).equal('Invalid path')
    })

    // TODO: missing doctype test
    // TODO: file without checksum

    onPlatform('win32', () => {
      it('detects path/platform incompatibilities if any', async function() {
        const remoteDir = builders
          .remoteDir()
          .name('f:oo')
          .build()
        const remoteDoc = builders
          .remoteFile()
          .inDir(remoteDir)
          .name('b<a>r')
          .build()

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
            reservedChars: ['<', '>'],
            platform
          },
          {
            type: 'reservedChars',
            name: 'f:oo',
            path: 'f:oo',
            docType: metadata.FOLDER,
            reservedChars: [':'],
            platform
          }
        ])
      })

      it('does not detect any when file/dir is in the trash', async function() {
        const remoteDoc = builders
          .remoteFile()
          .name('f:oo/b<a>r')
          .trashed()
          .build()

        const change /*: RemoteChange */ = this.watcher.identifyChange(
          remoteDoc,
          null,
          [],
          []
        )
        should(change.doc).not.have.property('incompatibilities')
      })
    })

    onPlatform('darwin', () => {
      it('does not mistakenly assume a new file is incompatible', async function() {
        const remoteDir = builders
          .remoteDir()
          .name('f:oo')
          .build()
        const remoteDoc = builders
          .remoteFile()
          .inDir(remoteDir)
          .name('b<a>r')
          .build()

        const change /*: RemoteChange */ = this.watcher.identifyChange(
          remoteDoc,
          null,
          [],
          []
        )
        should(change.type).equal('FileAddition')
        should(change.doc).not.have.property('incompatibilities')
      })
    })

    it('calls addDoc for a new doc', async function() {
      this.prep.addFileAsync = sinon.stub()
      this.prep.addFileAsync.resolves(null)
      const remoteDoc = builders
        .remoteFile()
        .inDir(dirs['my-folder/'])
        .name('file-5')
        .data('some data')
        .build()

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        null,
        [],
        []
      )

      const serializable = metadata.serializableRemote(remoteDoc)

      should(change.type).equal('FileAddition')
      should(change.doc).have.properties({
        path: path.join('my-folder', 'file-5'),
        docType: 'file',
        md5sum: serializable.md5sum,
        tags: serializable.tags,
        remote: serializable
      })
      should(change.doc).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls updateDoc when tags are updated', async function() {
      this.prep.updateFileAsync = sinon.stub()
      this.prep.updateFileAsync.resolves(null)
      const remoteDoc = builders
        .remoteFile(files['my-folder/file-1'])
        .tags('foo', 'bar', 'baz')
        .shortRev(5)
        .build()
      const was = await this.pouch.byRemoteId(remoteDoc._id)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      const serializable = metadata.serializableRemote(remoteDoc)

      should(change.type).equal('FileUpdate')
      should(change.doc).have.properties({
        path: path.join('my-folder', 'file-1'),
        docType: 'file',
        md5sum: serializable.md5sum,
        tags: serializable.tags,
        remote: {
          ...serializable,
          created_at: timestamp.roundedRemoteDate(serializable.created_at),
          updated_at: timestamp.roundedRemoteDate(serializable.updated_at)
        }
      })
    })

    it('calls updateDoc when content is overwritten', async function() {
      this.prep.updateFileAsync = sinon.stub().resolves(null)

      const remoteDoc = builders
        .remoteFile(files['my-folder/file-1'])
        .data('whatever data change')
        .shortRev(5)
        .build()
      const was = await this.pouch.byRemoteId(remoteDoc._id)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      const serializable = metadata.serializableRemote(remoteDoc)

      should(change.type).equal('FileUpdate')
      should(change.doc).have.properties({
        path: path.join('my-folder', 'file-1'),
        docType: 'file',
        md5sum: serializable.md5sum,
        tags: serializable.tags,
        remote: {
          ...serializable,
          created_at: timestamp.roundedRemoteDate(serializable.created_at),
          updated_at: timestamp.roundedRemoteDate(serializable.updated_at)
        }
      })
      should(change.doc).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveFile when file is renamed', async function() {
      this.prep.moveFileAsync = sinon.stub()
      this.prep.moveFileAsync.resolves(null)
      const remoteDoc = builders
        .remoteFile(files['my-folder/file-2'])
        .name('file-2-bis')
        .shortRev(5)
        .build()

      const was = await this.pouch.byRemoteIdMaybe(remoteDoc._id)
      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      const serializable = metadata.serializableRemote(remoteDoc)

      should(change).have.property('update', false)
      should(change.type).equal('FileMove')
      should(change.doc).have.properties({
        path: path.join('my-folder', 'file-2-bis'),
        docType: 'file',
        md5sum: serializable.md5sum,
        tags: serializable.tags,
        remote: {
          ...serializable,
          created_at: timestamp.roundedRemoteDate(serializable.created_at),
          updated_at: timestamp.roundedRemoteDate(serializable.updated_at)
        }
      })
      should(change.doc).not.have.properties(['_rev', 'path', 'name'])
    })

    it('calls moveFile when file is moved', async function() {
      this.prep.moveFileAsync = sinon.stub()
      this.prep.moveFileAsync.resolves(null)
      const remoteDir = builders
        .remoteDir()
        .name('other-folder')
        .build()
      const remoteDoc = builders
        .remoteFile(files['my-folder/file-2'])
        .inDir(remoteDir)
        .name('file-2-ter')
        .shortRev(5)
        .build()
      const was = await this.pouch.byRemoteIdMaybe(remoteDoc._id)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      const serializable = metadata.serializableRemote(remoteDoc)

      should(change).have.property('update', false)
      should(change.type).equal('FileMove')
      should(change.doc).have.properties({
        path: path.join('other-folder', 'file-2-ter'),
        docType: 'file',
        md5sum: serializable.md5sum,
        tags: serializable.tags,
        remote: {
          ...serializable,
          created_at: timestamp.roundedRemoteDate(serializable.created_at),
          updated_at: timestamp.roundedRemoteDate(serializable.updated_at)
        }
      })
      should(change.doc).not.have.properties(['_rev', 'path', 'name'])
    })

    it('detects when file was both moved and updated', async function() {
      const file = await builders
        .remoteFile()
        .name('meow.txt')
        .data('meow')
        .build()
      const was /*: Metadata */ = metadata.fromRemoteDoc(file)
      metadata.ensureValidPath(was)
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
      const remoteDoc = builders
        .remoteFile()
        .size('123')
        .shortRev(1)
        .build()
      const was /*: Metadata */ = builders
        .metafile()
        .fromRemote(remoteDoc)
        .size(456)
        .remoteRev(0)
        .build()
      should(remoteDoc.md5sum).equal(was.md5sum)

      const change /*: RemoteInvalidChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        [],
        []
      )

      should(change).have.property('type', 'InvalidChange')
      should(change.error).match(/corrupt/)
    })

    xit('calls deleteDoc & addDoc when trashed', async function() {
      this.prep.deleteFolderAsync = sinon.stub()
      this.prep.deleteFolderAsync.returnsPromise().resolves(null)
      this.prep.putFolderAsync = sinon.stub()
      this.prep.putFolderAsync.returnsPromise().resolves(null)
      const oldDir = builders
        .remoteDir()
        .name('foo')
        .build()
      const oldMeta /*: Metadata */ = await builders
        .metadir()
        .fromRemote(oldDir)
        .create()
      const newDir = builders
        .remoteDir(oldDir)
        .trashed()
        .build()

      this.watcher.identifyChange(newDir, null, [], [])

      should(this.prep.deleteFolderAsync.called).be.true()
      should(this.prep.putFolderAsync.called).be.true()
      const deleteArgs = this.prep.deleteFolderAsync.args[0]
      // FIXME: Make sure oldMeta timestamps are formatted as expected by PouchDB
      delete oldMeta.updated_at
      should(deleteArgs[0]).equal('remote')
      should(deleteArgs[1]).have.properties(oldMeta)
      const addArgs = this.prep.putFolderAsync.args[0]
      should(addArgs[0]).equal('remote')
      should(addArgs[1]).have.properties(metadata.fromRemoteDoc(newDir))
    })

    xit('calls deleteDoc & addDoc when restored', async function() {
      this.prep.deleteFolder = sinon.stub()
      this.prep.deleteFolder.returnsPromise().resolves(null)
      this.prep.putFolderAsync = sinon.stub()
      this.prep.putFolderAsync.returnsPromise().resolves(null)
      const oldDir = builders
        .remoteDir()
        .name('foo')
        .trashed()
        .build()
      const oldMeta /*: Metadata */ = await builders.metadir
        .fromRemote(oldDir)
        .create()
      const newDir = builders
        .remoteDir(oldDir)
        .restored()
        .build()

      this.watcher.identifyChange(newDir, null, [], [])

      should(this.prep.deleteFolder.called).be.true()
      should(this.prep.putFolderAsync.called).be.true()
      const deleteArgs = this.prep.deleteFolder.args[0]
      // FIXME: Make sure oldMeta timestamps are formatted as expected by PouchDB
      delete oldMeta.updated_at
      should(deleteArgs[0]).equal('remote')
      should(deleteArgs[1]).have.properties(oldMeta)
      const addArgs = this.prep.putFolderAsync.args[0]
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
          .trashed()
          .build()
        const newFile = builders
          .remoteFile(origFile)
          .restored()
          .shortRev(3)
          .build()

        const doc = metadata.fromRemoteDoc(newFile)

        should(
          this.watcher.identifyChange(newFile, trashedFile, [], [])
        ).have.properties({
          sideName: 'remote',
          type: 'FileAddition',
          doc
        })
      })
    })

    describe('file moved while deleted on local filesystem', () => {
      it('returns a FileMove', function() {
        const origFile = builders
          .remoteFile()
          .name('foo')
          .build()
        const trashedFile = builders
          .metafile()
          .fromRemote(origFile)
          .trashed()
          .changedSide('local')
          .build()
        const movedFile = builders
          .remoteFile(origFile)
          .name('bar')
          .build()

        const doc = metadata.fromRemoteDoc(movedFile)

        should(
          this.watcher.identifyChange(movedFile, trashedFile, [], [])
        ).have.properties({
          sideName: 'remote',
          type: 'FileMove',
          doc
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
