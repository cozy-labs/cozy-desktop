/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')
const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

const Buffer = require('../../../../core/local/steps/buffer')
const initialDiff = require('../../../../core/local/steps/initial_diff')

const kind = doc => doc.docType === 'folder' ? 'directory' : 'file'

describe('local/steps/initial_diff', () => {
  let builders

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('create builders', function () {
    builders = new Builders({pouch: this.pouch})
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('.initialState()', () => {
    it('returns initial state referenced by initial diff step name', async function () {
      const foo = await builders.metadir().path('foo').ino(1).create()
      const fizz = await builders.metafile().path('fizz').ino(2).create()

      const state = await initialDiff.initialState(this)
      should(state).have.property(initialDiff.STEP_NAME, {
        waiting: [],
        byInode: new Map([
          [foo.fileid || foo.ino, {
            path: foo.path,
            kind: kind(foo),
            updated_at: foo.updated_at
          }],
          [fizz.fileid || fizz.ino, {
            path: fizz.path,
            kind: kind(fizz),
            updated_at: fizz.updated_at,
            md5sum: fizz.md5sum
          }]
        ]),
        byPath: new Map()
      })
    })
  })

  describe('.loop()', () => {
    let buffer
    let initialScanDone

    beforeEach(function () {
      buffer = new Buffer()
      initialScanDone = builders.event().action('initial-scan-done').kind('unknown').path('').build()
    })

    it('detects documents moved while client was stopped', async function () {
      await builders.metadir().path('foo').ino(1).create()
      await builders.metafile().path('fizz').ino(2).create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const bar = builders.event().action('scan').kind('directory').path('bar').ino(1).build()
      const buzz = builders.event().action('scan').kind('file').path('buzz').ino(2).build()
      buffer.push([bar, buzz, initialScanDone])
      buffer = initialDiff.loop(buffer, { pouch: this.pouch, state })

      const events = await buffer.pop()
      should(events).deepEqual([
        builders.event(bar).action('renamed').oldPath('foo').build(),
        builders.event(buzz).action('renamed').oldPath('fizz').build(),
        initialScanDone
      ])
    })

    it('detects documents moved while client is doing initial scan', async function () {
      await builders.metadir().path('foo').ino(1).create()
      await builders.metafile().path('foo/baz').ino(2).create()
      await builders.metadir().path('bar').ino(3).create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const foo = builders.event().action('scan').kind('directory').path('foo').ino(1).build()
      const barbaz = builders.event().action('created').kind('file').path('bar/baz').ino(2).build()
      buffer.push([foo, barbaz])
      const bar = builders.event().action('scan').kind('directory').path('bar').ino(3).build()
      buffer.push([
        bar,
        builders.event().action('scan').kind('file').path('bar/baz').ino(2).build(),
        initialScanDone
      ])
      buffer = initialDiff.loop(buffer, { pouch: this.pouch, state })

      const events = [].concat(
        await buffer.pop(),
        await buffer.pop()
      )
      should(events).deepEqual([
        foo,
        builders.event(barbaz).action('renamed').oldPath('foo/baz').build(),
        bar,
        initialScanDone
      ])
    })

    it('detects documents replaced by another one of a different kind while client was stopped', async function () {
      await builders.metadir().path('foo').ino(1).create()
      await builders.metafile().path('bar').ino(2).create()
      await builders.metadir().path('fizz').ino(3).create()
      await builders.metafile().path('buzz').ino(4).create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const foo = builders.event().action('scan').kind('file').path('foo').ino(2).build()
      const buzz = builders.event().action('scan').kind('directory').path('buzz').ino(3).build()
      buffer.push([foo, buzz, initialScanDone])
      buffer = initialDiff.loop(buffer, { pouch: this.pouch, state })

      const events = await buffer.pop()
      should(events).deepEqual([
        builders.event(foo).action('renamed').oldPath('bar').build(),
        builders.event(buzz).action('renamed').oldPath('fizz').build(),
        initialScanDone
      ])
    })

    it('detects documents replaced by another one with a different ino while client was stopped', async function () {
      await builders.metadir().path('foo').ino(1).create()
      await builders.metafile().path('bar').ino(2).create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const foo = builders.event().action('scan').kind('directory').path('foo').ino(3).build()
      const bar = builders.event().action('scan').kind('file').path('bar').ino(4).build()
      buffer.push([foo, bar, initialScanDone])
      buffer = initialDiff.loop(buffer, { pouch: this.pouch, state })

      const events = await buffer.pop()
      should(events).deepEqual([
        foo,
        bar,
        initialScanDone
      ])
    })

    it('detects documents removed while client was stopped', async function () {
      const foo = await builders.metadir().path('foo').ino(1).create()
      const bar = await builders.metafile().path('bar').ino(2).create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      buffer.push([initialScanDone])
      buffer = initialDiff.loop(buffer, { pouch: this.pouch, state })

      const events = await buffer.pop()
      should(events).deepEqual([
        {
          _id: bar._id,
          action: 'deleted',
          initialDiff: {notFound: _.defaults({kind: kind(bar)}, _.pick(bar, ['path', 'md5sum', 'updated_at']))},
          kind: 'file',
          path: bar.path
        },
        {
          _id: foo._id,
          action: 'deleted',
          initialDiff: {notFound: _.defaults({kind: kind(foo)}, _.pick(foo, ['path', 'updated_at']))},
          kind: 'directory',
          path: foo.path
        },
        initialScanDone
      ])
    })

    it('reuses the checksum of untouched files', async function () {
      const stillEmptyFile = await builders.metafile()
        .path('stillEmptyFile')
        .ino(2)
        .data('')
        .create()
      const sameContentFile = await builders.metafile()
        .path('sameContentFile')
        .ino(3)
        .data('content')
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const stillEmptyFileScan = builders.event()
        .fromDoc(stillEmptyFile)
        .action('scan')
        .mtime(new Date(stillEmptyFile.updated_at))
        .build()
      const sameContentFileScan = builders.event()
        .fromDoc(sameContentFile)
        .action('scan')
        .ctime(new Date(sameContentFile.updated_at))
        .build()
      buffer.push(_.cloneDeep([
        stillEmptyFileScan,
        sameContentFileScan,
        initialScanDone
      ]))
      buffer = initialDiff.loop(buffer, { pouch: this.pouch, state })

      const events = await buffer.pop()
      should(events).deepEqual([
        _.defaults(
          {
            md5sum: stillEmptyFile.md5sum,
            initialDiff: { md5sumReusedFrom: stillEmptyFile.path }
          },
          stillEmptyFileScan
        ),
        _.defaults(
          {
            md5sum: sameContentFile.md5sum,
            initialDiff: { md5sumReusedFrom: sameContentFile.path }
          },
          sameContentFileScan
        ),
        initialScanDone
      ])
    })

    it('does not try to reuse the checksum of a directory', async function () {
      const dir = await builders.metadir()
        .path('dir')
        .ino(1)
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const dirScan = builders.event()
        .fromDoc(dir)
        .action('scan')
        .mtime(new Date(dir.updated_at))
        .build()
      buffer.push(_.cloneDeep([
        dirScan,
        initialScanDone
      ]))
      buffer = initialDiff.loop(buffer, { pouch: this.pouch, state })

      const events = await buffer.pop()
      should(events).deepEqual([
        dirScan,
        initialScanDone
      ])
    })

    it('does not reuse the checksum of modified files', async function () {
      const updatedMetadata = await builders.metafile()
        .path('updatedMetadata')
        .ino(1)
        .data('content')
        .create()
      const updatedContent = await builders.metafile()
        .path('updatedContent')
        .ino(2)
        .data('content')
        .create()

      const state = await initialDiff.initialState({ pouch: this.pouch })

      const updateTime = new Date(Date.now() + 1000)
      const updatedMetadataScan = builders.event()
        .fromDoc(updatedMetadata)
        .action('scan')
        .ctime(updateTime)
        .build()
      const updatedContentScan = builders.event()
        .fromDoc(updatedContent)
        .action('scan')
        .mtime(updateTime)
        .build()
      buffer.push(_.cloneDeep([
        updatedMetadataScan,
        updatedContentScan,
        initialScanDone
      ]))
      buffer = initialDiff.loop(buffer, { pouch: this.pouch, state })

      const events = await buffer.pop()
      should(events).deepEqual([
        updatedMetadataScan,
        updatedContentScan,
        initialScanDone
      ])
    })
  })
})
