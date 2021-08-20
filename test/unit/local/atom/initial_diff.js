/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const path = require('path')

const should = require('should')
const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

const { WINDOWS_DATE_MIGRATION_FLAG } = require('../../../../core/config')
const Channel = require('../../../../core/local/atom/channel')
const initialDiff = require('../../../../core/local/atom/initial_diff')

const kind = doc => (doc.docType === 'folder' ? 'directory' : 'file')

const sameSecondDate = date => new Date(new Date(date).setMilliseconds(0))

describe('core/local/atom/initial_diff', () => {
  let builders

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('create builders', function() {
    builders = new Builders({ pouch: this.pouch })
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('.initialState()', () => {
    it('returns initial state referenced by initial diff step name', async function() {
      const foo = await builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .create()
      const fizz = await builders
        .metafile()
        .path('fizz')
        .ino(2)
        .upToDate()
        .create()
      const bar = await builders
        .metadir()
        .path('bar')
        .ino(3)
        .sides({ local: 1 })
        .create()
      await builders
        .metafile()
        .path('baz')
        .sides({ remote: 1 })
        .create()

      const state = await initialDiff.initialState(this)
      should(state).have.property(initialDiff.STEP_NAME, {
        waiting: [],
        renamedEvents: [],
        scannedPaths: new Set(),
        byInode: new Map([
          [foo.fileid || foo.ino, foo],
          [fizz.fileid || fizz.ino, fizz],
          [bar.fileid || bar.ino, bar]
        ]),
        initialScanDone: false
      })
    })
  })

  describe('.clearState()', () => {
    it('removes every item from all initialDiff state collections', function() {
      const doc = builders
        .metadata()
        .path('foo')
        .ino(1)
        .upToDate()
        .build()
      const waiting = [
        { batch: [], nbCandidates: 0, timeout: setTimeout(() => {}, 0) }
      ]
      const renamedEvents = [
        builders
          .event()
          .path('foo')
          .oldPath('bar')
          .build()
      ]
      const scannedPaths = new Set(['foo'])
      const byInode = new Map([[doc.fileid || doc.ino || '', doc]]) // Flow thinks doc.ino can be null
      const state = {
        [initialDiff.STEP_NAME]: {
          waiting,
          renamedEvents,
          scannedPaths,
          byInode,
          initialScanDone: false
        }
      }

      initialDiff.clearState(state)

      should(state).deepEqual({
        [initialDiff.STEP_NAME]: {
          waiting: [],
          renamedEvents: [],
          scannedPaths: new Set(),
          byInode: new Map(),
          initialScanDone: true
        }
      })
    })
  })

  describe('.loop()', () => {
    let channel
    let initialScanDone

    const inputBatch = batch => channel.push(_.cloneDeep(batch))

    beforeEach(function() {
      channel = new Channel()
      initialScanDone = builders
        .event()
        .action('initial-scan-done')
        .kind('unknown')
        .path('')
        .build()
    })

    it('forwards events untouched when initial scan is done', async function() {
      await builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })
      initialDiff.clearState(state)

      const fooRenamed = builders
        .event()
        .action('renamed')
        .kind('directory')
        .oldPath('foo')
        .path('bar')
        .ino(1)
        .build()
      const fooCreated = builders
        .event()
        .action('created')
        .kind('directory')
        .path('foo')
        .ino(2)
        .build()
      const fooBuzzCreated = builders
        .event()
        .action('created')
        .kind('file')
        .path('foo/buzz')
        .ino(3)
        .build()
      inputBatch([fooRenamed, fooCreated, fooBuzzCreated, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        fooRenamed,
        fooCreated,
        fooBuzzCreated,
        initialScanDone
      ])
    })

    it('clears the state after initial-scan-done is received', async function() {
      const state = await initialDiff.initialState({ pouch: this.pouch })
      const outChannel = initialDiff.loop(channel, {
        config: this.config,
        pouch: this.pouch,
        state
      })

      // Send normal event
      const fooScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path('foo')
        .ino(1)
        .build()
      inputBatch([fooScan])
      await outChannel.pop()

      should(state.initialDiff)
        .have.property('initialScanDone')
        .be.false()

      // Send initial-scan-done
      inputBatch([initialScanDone])
      await outChannel.pop()

      should(state.initialDiff)
        .have.property('initialScanDone')
        .be.true()
    })

    it('detects documents moved while client was stopped', async function() {
      await builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metafile()
        .path('fizz')
        .ino(2)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const barScan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('bar')
        .ino(1)
        .build()
      const buzzScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path('buzz')
        .ino(2)
        .build()
      inputBatch([barScan, buzzScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        {
          ...barScan,
          action: 'renamed',
          oldPath: path.normalize('foo'),
          [initialDiff.STEP_NAME]: { actionConvertedFrom: barScan.action }
        },
        {
          ...buzzScan,
          action: 'renamed',
          oldPath: path.normalize('fizz'),
          [initialDiff.STEP_NAME]: { actionConvertedFrom: buzzScan.action }
        },
        initialScanDone
      ])
    })

    it('detects documents moved while client is doing initial scan', async function() {
      await builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metafile()
        .path('foo/baz')
        .ino(2)
        .upToDate()
        .create()
      await builders
        .metadir()
        .path('bar')
        .ino(3)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const fooScan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('foo')
        .ino(1)
        .build()
      const barbazCreated = builders
        .event()
        .action('created')
        .kind('file')
        .path('bar/baz')
        .ino(2)
        .build()
      inputBatch([fooScan, barbazCreated])
      const barScan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('bar')
        .ino(3)
        .build()
      const barBazScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path('bar/baz')
        .ino(2)
        .build()
      inputBatch([barScan, barBazScan, initialScanDone])

      channel = initialDiff.loop(channel, {
        config: this.config,
        pouch: this.pouch,
        state
      })
      const events = [].concat(await channel.pop(), await channel.pop())

      should(events).deepEqual([
        fooScan,
        {
          ...barbazCreated,
          action: 'renamed',
          oldPath: path.normalize('foo/baz'),
          [initialDiff.STEP_NAME]: { actionConvertedFrom: barbazCreated.action }
        },
        barScan,
        initialScanDone
      ])
    })

    it('detects documents replaced by another one of a different kind while client was stopped', async function() {
      await builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metafile()
        .path('bar')
        .ino(2)
        .upToDate()
        .create()
      await builders
        .metadir()
        .path('fizz')
        .ino(3)
        .upToDate()
        .create()
      await builders
        .metafile()
        .path('buzz')
        .ino(4)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const fooScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path('foo')
        .ino(2)
        .build()
      const buzzScan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('buzz')
        .ino(3)
        .build()
      inputBatch([fooScan, buzzScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        // FIXME: we are overwriting existing documents.
        // We should issue `deleted` events for the destinations of the 2 `renamed` events
        {
          ...fooScan,
          action: 'renamed',
          oldPath: 'bar',
          [initialDiff.STEP_NAME]: { actionConvertedFrom: fooScan.action }
        },
        {
          ...buzzScan,
          action: 'renamed',
          oldPath: 'fizz',
          [initialDiff.STEP_NAME]: { actionConvertedFrom: buzzScan.action }
        },
        initialScanDone
      ])
    })

    it('detects documents replaced by another one with a different ino while client was stopped', async function() {
      await builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metafile()
        .path('bar')
        .ino(2)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const fooScan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('foo')
        .ino(3)
        .build()
      const barScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path('bar')
        .ino(4)
        .build()
      inputBatch([fooScan, barScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        // FIXME: we are overwriting existing documents.
        // We should issue `deleted` events for the paths of the 2 `scan` events
        fooScan,
        barScan,
        initialScanDone
      ])
    })

    it('detects documents replaced by another one of a different kind with the same ino while client was stopped', async function() {
      await builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metafile()
        .path('bar')
        .ino(2)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const fooScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path('foo')
        .ino(1)
        .build()
      const barScan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('bar')
        .ino(2)
        .build()
      inputBatch([fooScan, barScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        // FIXME: we are overwriting existing documents.
        // We should issue `deleted` events for the paths of the 2 `scan` events
        fooScan,
        barScan,
        initialScanDone
      ])
    })

    it('detects documents removed while client was stopped', async function() {
      const foo = await builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .create()
      const bar = await builders
        .metafile()
        .path('bar')
        .ino(2)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      inputBatch([initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        {
          action: 'deleted',
          initialDiff: {
            notFound: _.defaults(
              { kind: kind(bar), path: bar.local.path },
              _.pick(bar, ['md5sum', 'updated_at'])
            )
          },
          kind: 'file',
          path: bar.local.path,
          deletedIno: bar.local.fileid || bar.local.ino
        },
        {
          action: 'deleted',
          initialDiff: {
            notFound: _.defaults(
              { kind: kind(foo), path: foo.local.path },
              _.pick(foo, ['md5sum', 'updated_at'])
            )
          },
          kind: 'directory',
          path: foo.local.path,
          deletedIno: foo.local.fileid || foo.local.ino
        },
        initialScanDone
      ])
    })

    it('reuses the checksum of untouched files', async function() {
      const stillEmptyFile = await builders
        .metafile()
        .path('stillEmptyFile')
        .ino(2)
        .data('')
        .upToDate()
        .create()
      const sameContentFile = await builders
        .metafile()
        .path('sameContentFile')
        .ino(3)
        .data('content')
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const stillEmptyFileScan = builders
        .event()
        .fromDoc(stillEmptyFile)
        .action('scan')
        .mtime(new Date(stillEmptyFile.updated_at))
        .build()
      const sameContentFileScan = builders
        .event()
        .fromDoc(sameContentFile)
        .action('scan')
        .ctime(new Date(sameContentFile.updated_at))
        .build()
      inputBatch([stillEmptyFileScan, sameContentFileScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        {
          ...stillEmptyFileScan,
          md5sum: stillEmptyFile.md5sum,
          initialDiff: { md5sumReusedFrom: stillEmptyFile.path }
        },
        {
          ...sameContentFileScan,
          md5sum: sameContentFile.md5sum,
          initialDiff: { md5sumReusedFrom: sameContentFile.path }
        },
        initialScanDone
      ])
    })

    it('does not try to reuse the checksum of a directory', async function() {
      const dir = await builders
        .metadir()
        .path('dir')
        .ino(1)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const dirScan = builders
        .event()
        .fromDoc(dir)
        .action('scan')
        .mtime(new Date(dir.updated_at))
        .build()
      inputBatch([dirScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([dirScan, initialScanDone])
    })

    it('does not reuse the checksum of modified files', async function() {
      const updatedContent = await builders
        .metafile()
        .path('updatedContent')
        .ino(2)
        .data('content')
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const updateTime = new Date(Date.now() + 1000)
      const updatedContentScan = builders
        .event()
        .fromDoc(updatedContent)
        .action('scan')
        .mtime(updateTime)
        .build()
      inputBatch([updatedContentScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([updatedContentScan, initialScanDone])
    })

    context('when WINDOWS_DATE_MIGRATION_FLAG is active', () => {
      before(function() {
        this.config.setFlag(WINDOWS_DATE_MIGRATION_FLAG, true)
      })
      after(function() {
        this.config.setFlag(WINDOWS_DATE_MIGRATION_FLAG, false)
      })

      it('reuses the checksum of untouched files with a same second modification date', async function() {
        const emptyFileUpdateDate = new Date()
        const stillEmptyFile = await builders
          .metafile()
          .path('stillEmptyFile')
          .ino(2)
          .data('')
          .updatedAt(sameSecondDate(emptyFileUpdateDate))
          .upToDate()
          .create()
        const sameContentFileUpdateDate = new Date()
        const sameContentFile = await builders
          .metafile()
          .path('sameContentFile')
          .ino(3)
          .data('content')
          .updatedAt(sameSecondDate(sameContentFileUpdateDate))
          .upToDate()
          .create()

        const state = await initialDiff.initialState({ pouch: this.pouch })

        const stillEmptyFileScan = builders
          .event()
          .fromDoc(stillEmptyFile)
          .action('scan')
          .mtime(emptyFileUpdateDate)
          .build()
        const sameContentFileScan = builders
          .event()
          .fromDoc(sameContentFile)
          .action('scan')
          .ctime(sameContentFileUpdateDate)
          .build()
        inputBatch([stillEmptyFileScan, sameContentFileScan, initialScanDone])

        const events = await initialDiff
          .loop(channel, { config: this.config, pouch: this.pouch, state })
          .pop()

        should(events).deepEqual([
          {
            ...stillEmptyFileScan,
            md5sum: stillEmptyFile.md5sum,
            initialDiff: { md5sumReusedFrom: stillEmptyFile.path }
          },
          {
            ...sameContentFileScan,
            md5sum: sameContentFile.md5sum,
            initialDiff: { md5sumReusedFrom: sameContentFile.path }
          },
          initialScanDone
        ])
      })
    })

    context('when WINDOWS_DATE_MIGRATION_FLAG is inactive', () => {
      it('does not reuse the checksum of untouched files with a same second modification date', async function() {
        const updatedContentUpdateDate = new Date()
        const updatedContent = await builders
          .metafile()
          .path('updatedContent')
          .ino(2)
          .data('content')
          .updatedAt(sameSecondDate(updatedContentUpdateDate))
          .upToDate()
          .create()

        const state = await initialDiff.initialState({ pouch: this.pouch })

        const updatedContentScan = builders
          .event()
          .fromDoc(updatedContent)
          .action('scan')
          .mtime(updatedContentUpdateDate)
          .build()
        inputBatch([updatedContentScan, initialScanDone])

        const events = await initialDiff
          .loop(channel, { config: this.config, pouch: this.pouch, state })
          .pop()

        should(events).deepEqual([updatedContentScan, initialScanDone])
      })
    })

    it('ignores events for unapplied moves', async function() {
      const wasDir = builders
        .metadir()
        .path('foo')
        .ino(1)
        .upToDate()
        .build()
      await builders
        .metadir()
        .moveFrom(wasDir)
        .path('foo2')
        .changedSide('remote')
        .create()
      const wasFile = builders
        .metafile()
        .path('fizz')
        .ino(2)
        .upToDate()
        .build()
      await builders
        .metafile()
        .moveFrom(wasFile)
        .path('fizz2')
        .changedSide('remote')
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const fooScan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('foo')
        .ino(1)
        .build()
      const fizzScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path('fizz')
        .ino(2)
        .build()
      inputBatch([fooScan, fizzScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        {
          ...fooScan,
          action: 'ignored',
          [initialDiff.STEP_NAME]: { unappliedMoveTo: 'foo2' }
        },
        {
          ...fizzScan,
          action: 'ignored',
          [initialDiff.STEP_NAME]: { unappliedMoveTo: 'fizz2' }
        },
        initialScanDone
      ])
    })

    it('fixes renamed after parent renamed', async function() {
      await builders
        .metadir()
        .path('parent')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metadir()
        .path('parent/foo')
        .ino(2)
        .upToDate()
        .create()
      await builders
        .metadir()
        .path('parent/foo/bar')
        .ino(3)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const parent2Scan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('parent-2')
        .ino(1)
        .build()
      const foo2Scan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('parent-2/foo-2')
        .ino(2)
        .build()
      const bar2Scan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('parent-2/foo-2/bar-2')
        .ino(3)
        .build()
      inputBatch([parent2Scan, foo2Scan, bar2Scan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        {
          ...parent2Scan,
          action: 'renamed',
          oldPath: 'parent',
          [initialDiff.STEP_NAME]: { actionConvertedFrom: parent2Scan.action }
        },
        {
          ...foo2Scan,
          action: 'renamed',
          oldPath: path.normalize('parent-2/foo'),
          [initialDiff.STEP_NAME]: {
            actionConvertedFrom: foo2Scan.action,
            renamedAncestor: {
              oldPath: 'parent',
              path: parent2Scan.path
            }
          }
        },
        {
          ...bar2Scan,
          action: 'renamed',
          oldPath: path.normalize('parent-2/foo-2/bar'),
          [initialDiff.STEP_NAME]: {
            actionConvertedFrom: bar2Scan.action,
            renamedAncestor: {
              oldPath: path.normalize('parent-2/foo'),
              path: foo2Scan.path
            }
          }
        },
        initialScanDone
      ])
    })

    it('fixes deleted after parent renamed', async function() {
      await builders
        .metadir()
        .path('parent')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metadir()
        .path('parent/foo')
        .ino(2)
        .upToDate()
        .create()
      const missingDoc = await builders
        .metadir()
        .path('parent/foo/bar')
        .ino(3)
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const parent2Scan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('parent-2')
        .ino(1)
        .build()
      const foo2Scan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('parent-2/foo-2')
        .ino(2)
        .build()
      inputBatch([parent2Scan, foo2Scan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      const deletedPath = path.normalize('parent-2/foo-2/bar')
      const deletedIno = missingDoc.local.fileid || missingDoc.local.ino

      should(events).deepEqual([
        {
          ...parent2Scan,
          action: 'renamed',
          oldPath: 'parent',
          [initialDiff.STEP_NAME]: { actionConvertedFrom: parent2Scan.action }
        },
        {
          ...foo2Scan,
          action: 'renamed',
          oldPath: path.normalize('parent-2/foo'),
          [initialDiff.STEP_NAME]: {
            actionConvertedFrom: foo2Scan.action,
            renamedAncestor: {
              oldPath: 'parent',
              path: parent2Scan.path
            }
          }
        },
        {
          action: 'deleted',
          kind: 'directory',
          path: deletedPath,
          [initialDiff.STEP_NAME]: {
            notFound: {
              path: deletedPath,
              kind: 'directory',
              updated_at: missingDoc.updated_at
            },
            renamedAncestor: {
              oldPath: path.normalize('parent-2/foo'),
              path: foo2Scan.path
            }
          },
          deletedIno
        },
        initialScanDone
      ])
    })

    it('does not swallow possible changes on move descendants', async function() {
      await builders
        .metadir()
        .path('parent')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metafile()
        .path('parent/foo')
        .ino(2)
        .data('initial content')
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const parent2Scan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('parent-2')
        .ino(1)
        .build()
      const fooScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path(path.normalize('parent-2/foo'))
        .ino(2)
        .data('new content')
        .build()
      inputBatch([parent2Scan, fooScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        {
          ...parent2Scan,
          action: 'renamed',
          oldPath: 'parent',
          [initialDiff.STEP_NAME]: { actionConvertedFrom: parent2Scan.action }
        },
        {
          ...fooScan,
          action: 'scan',
          oldPath: path.normalize('parent/foo'),
          [initialDiff.STEP_NAME]: {
            actionConvertedFrom: fooScan.action,
            renamedAncestor: {
              oldPath: 'parent',
              path: parent2Scan.path
            }
          }
        },
        initialScanDone
      ])
    })

    it('does not delete replaced file after parent move', async function() {
      await builders
        .metadir()
        .path('parent')
        .ino(1)
        .upToDate()
        .create()
      await builders
        .metafile()
        .path('parent/foo')
        .ino(2)
        .data('initial content')
        .upToDate()
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const parent2Scan = builders
        .event()
        .action('scan')
        .kind('directory')
        .path('parent-2')
        .ino(1)
        .build()
      const fooScan = builders
        .event()
        .action('scan')
        .kind('file')
        .path(path.normalize('parent-2/foo'))
        .ino(3)
        .data('new content')
        .build()
      inputBatch([parent2Scan, fooScan, initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([
        {
          ...parent2Scan,
          action: 'renamed',
          oldPath: 'parent',
          [initialDiff.STEP_NAME]: { actionConvertedFrom: parent2Scan.action }
        },
        fooScan,
        initialScanDone
      ])
    })

    it('does not delete unsynced remote additions', async function() {
      await builders
        .metadir()
        .path('dir')
        .ino(1)
        .sides({ remote: 1 })
        .create()
      await builders
        .metafile()
        .path('file')
        .ino(2)
        .data('initial content')
        .sides({ remote: 1 })
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      inputBatch([initialScanDone])

      const events = await initialDiff
        .loop(channel, { config: this.config, pouch: this.pouch, state })
        .pop()

      should(events).deepEqual([initialScanDone])
    })
  })
})
