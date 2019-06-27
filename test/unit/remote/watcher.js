/* @flow */
/* eslint-env mocha */

const EventEmitter = require('events')
const _ = require('lodash')
const path = require('path')
const sinon = require('sinon')
const should = require('should')
const CozyClient = require('cozy-client-js').Client
const { FetchError } = require('electron-fetch')

const configHelpers = require('../../support/helpers/config')
const { posixifyPath } = require('../../support/helpers/context_dir')
const { onPlatform, onPlatforms } = require('../../support/helpers/platform')
const pouchHelpers = require('../../support/helpers/pouch')
const { builders } = require('../../support/helpers/cozy')

const metadata = require('../../../core/metadata')
const { MergeMissingParentError } = require('../../../core/merge')
const { FILES_DOCTYPE } = require('../../../core/remote/constants')
const Prep = require('../../../core/prep')
const { RemoteCozy } = require('../../../core/remote/cozy')
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
      await pouchHelpers.createFolder(this.pouch, i)
      await pouchHelpers.createFile(this.pouch, i)
    }
  })

  describe('start', function() {
    beforeEach(function() {
      sinon.stub(this.watcher, 'watch').returns(Promise.resolve())
      return this.watcher.start()
    })

    afterEach(function() {
      this.watcher.watch.restore()
    })

    it('calls watch() a first time', function() {
      this.watcher.watch.callCount.should.equal(1)
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
      await this.watcher.start().started
      should(this.watcher.runningResolve).not.be.null()
      this.watcher.stop()
      should(this.watcher.runningResolve).be.null()
    })

    it('does nothing when called again', async function() {
      await this.watcher.start().started
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

    context('on FetchError', () => {
      const fetchError = new FetchError('net::ERR_INTERNET_DISCONNECTED')

      beforeEach(function() {
        this.remoteCozy.changes.rejects(fetchError)
      })

      it('does not reject', async function() {
        await should(this.watcher.watch()).not.be.rejected()
      })

      it('emits offline event', async function() {
        await this.watcher.watch()
        should(this.events.emit)
          .have.been.calledWith('offline')
          .calledOnce()
      })
    })

    context('on other Error', () => {
      const otherError = new Error('Other error')

      beforeEach(function() {
        this.remoteCozy.changes.rejects(otherError)
      })

      it('rejects', async function() {
        await should(this.watcher.watch()).be.rejectedWith(otherError)
      })

      it('does not emit offline event', async function() {
        await this.watcher.watch().catch(() => {})
        should(this.events.emit).not.have.been.called()
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
      // Changes are sorted before applying (first one got the original
      // RemoteDeletion, while second one was given Metadata since it is valid)
      should(apply.args[0][0].doc).deepEqual(remoteDocs[1])
      should(apply.args[1][0].doc).deepEqual(validMetadata(remoteDocs[0]))
    })

    context('when apply() rejects some file/dir', function() {
      let errType

      beforeEach(function() {
        errType = Error
        apply.callsFake(async (
          change /*: RemoteChange */
        ) /*: Promise<void> */ => {
          if (change.type === 'FileAddition') throw new errType(change.doc)
        })
      })

      it('resolves with an array of errors', function() {
        const errors = [new errType(remoteDocs[0])]
        return should(this.watcher.pullMany(remoteDocs)).be.fulfilledWith(
          errors
        )
      })

      it('ignores MergeMissingParentError', async function() {
        errType = MergeMissingParentError
        await should(this.watcher.pullMany(remoteDocs)).be.fulfilledWith([])
      })

      it('still tries to pull other files/dirs', async function() {
        await this.watcher.pullMany(remoteDocs).catch(() => {})
        should(apply).have.been.calledTwice()
        should(apply.args[0][0]).have.properties({
          type: 'IgnoredChange',
          doc: remoteDocs[1]
        })
        should(apply.args[1][0]).have.properties({
          type: 'FileAddition',
          doc: validMetadata(remoteDocs[0])
        })
      })

      it('releases the Pouch lock', async function() {
        await this.watcher.pullMany(remoteDocs).catch(() => {})
        const nextLockPromise = this.pouch.lock('nextLock')
        await should(nextLockPromise).be.fulfilled()
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
            type: 'IgnoredChange',
            doc: { path: '.cozy_trash/file' },
            was: { path: 'dst/file' }
          },
          {
            type: 'FileMove',
            doc: { path: 'dst/file', overwrite: true },
            was: { path: 'src/file' }
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
          it('detects the trashing before the move to prevent id confusion', function() {
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
          it('detects the move before the trashing', function() {
            const remoteDocs = [srcFileMoved, dstFileTrashed]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'FileMove',
                doc: { path: 'dst/file' },
                was: { path: 'src/file' }
              },
              {
                type: 'FileTrashing',
                doc: { path: '.cozy_trash/FILE' },
                was: { path: 'dst/FILE' }
              }
            ])
          })
        })
      })

      describe('when trashed destination is first', () => {
        onPlatforms(['win32', 'darwin'], () => {
          it('detects the trashing before the move to prevent id confusion', function() {
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
          it('detects the move before the trashing', function() {
            const remoteDocs = [dstFileTrashed, srcFileMoved]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'FileMove',
                doc: { path: 'dst/file' },
                was: { path: 'src/file' }
              },
              {
                type: 'FileTrashing',
                doc: { path: '.cozy_trash/FILE' },
                was: { path: 'dst/FILE' }
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
            type: 'IgnoredChange',
            doc: { path: '.cozy_trash/dir' },
            was: { path: 'dst/dir' }
          },
          {
            type: 'DirMove',
            doc: { path: 'dst/dir', overwrite: true },
            was: { path: 'src/dir' }
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
          it('detects the trashing before the move to prevent id confusion', function() {
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
          it('is detects the move before the trashing', function() {
            const remoteDocs = [srcMoved, dstTrashed]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'DirMove',
                doc: { path: 'dst/dir' },
                was: { path: 'src/dir' }
              },
              {
                type: 'DirTrashing',
                doc: { path: '.cozy_trash/DIR' },
                was: { path: 'dst/DIR' }
              }
            ])
          })
        })
      })

      describe('when trashed destination is first', () => {
        onPlatforms(['win32', 'darwin'], () => {
          it('detects the trashing before the move to prevent id confusion', function() {
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
          it('detects the move before the trashing ', function() {
            const remoteDocs = [dstTrashed, srcMoved]
            const changes = this.watcher.analyse(remoteDocs, olds)
            should(relevantChangesProps(changes)).deepEqual([
              {
                type: 'DirMove',
                doc: { path: 'dst/dir' },
                was: { path: 'src/dir' }
              },
              {
                type: 'DirTrashing',
                doc: { path: '.cozy_trash/DIR' },
                was: { path: 'dst/DIR' }
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
            .map(x => x.type)
            .sort()
            .should.deepEqual([
              'DescendantChange',
              'DescendantChange',
              'DirMove'
            ])
          const dirMoveChange = result.filter(x => x.type === 'DirMove')[0]
          dirMoveChange.descendantMoves.should.have.length(2)
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
        0,
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
        0,
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
          0,
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
          0,
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
          0,
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
        0,
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
      let remoteDoc /*: RemoteDoc */ = {
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
      const was = await this.pouch.byRemoteIdAsync(remoteDoc._id)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        0,
        []
      )

      should(change.type).equal('FileUpdate')
      should(change.doc).have.properties({
        path: path.normalize('my-folder/file-1'),
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
      let remoteDoc /*: RemoteDoc */ = {
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
      const was = await this.pouch.byRemoteIdAsync(remoteDoc._id)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        0,
        []
      )

      should(change.type).equal('FileUpdate')
      should(change.doc).have.properties({
        path: path.normalize('my-folder/file-1'),
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
      let remoteDoc /*: RemoteDoc */ = {
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

      const was = await this.pouch.byRemoteIdMaybeAsync(remoteDoc._id)
      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        0,
        []
      )

      should(change.type).equal('FileMove')
      // $FlowFixMe
      const src = change.was
      should(src).have.properties({
        path: path.normalize('my-folder/file-2'),
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: '12345678902'
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
      let remoteDoc /*: RemoteDoc */ = {
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
      const was /*: Metadata */ = await this.pouch.db.get(
        metadata.id(path.normalize('my-folder/file-2'))
      )
      await this.pouch.db.put(was)

      const change /*: RemoteChange */ = this.watcher.identifyChange(
        _.clone(remoteDoc),
        was,
        0,
        []
      )

      should(change.type).equal('FileMove')
      should(change).not.have.property('update')
      // $FlowFixMe
      const src = change.was
      should(src).have.properties({
        path: path.normalize('my-folder/file-2'),
        docType: 'file',
        md5sum: remoteDoc.md5sum,
        tags: remoteDoc.tags,
        remote: {
          _id: '12345678902'
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
        0,
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
        0,
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
      should(addArgs[1]).have.properties(metadata.fromRemoteDoc(newDir))
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
            const change = this.watcher.identifyChange(remoteDoc, was, 0, [])
            should(change.type).equal('UpToDate')
          })
        })
      })
    })
  })
})
