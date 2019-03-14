/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const Builders = require('../../../support/builders')
const { ContextDir } = require('../../../support/helpers/context_dir')
const configHelpers = require('../../../support/helpers/config')

const metadata = require('../../../../core/metadata')
const stater = require('../../../../core/local/stater')
const Buffer = require('../../../../core/local/steps/buffer')
const incompleteFixer = require('../../../../core/local/steps/incomplete_fixer')

const CHECKSUM = 'checksum'
const checksumer = {
  push: sinon.stub().resolves(CHECKSUM),
  kill: sinon.stub()
}

const completedEvent = event =>
  _.omit(event, ['stats', 'incompleteFixer'])
const completionChanges = events => events.map(completedEvent)

describe('core/local/steps/incomplete_fixer', () => {
  let syncDir
  let builders

  before('create config', configHelpers.createConfig)
  before('create helpers', function () {
    syncDir = new ContextDir(this.syncPath)
    builders = new Builders()
  })
  after('cleanup config', configHelpers.cleanConfig)

  describe('.loop()', () => {
    it('pushes the result of step() into the output buffer', async function () {
      const { syncPath } = this

      const src = 'missing'
      const dst = path.basename(__filename)
      await syncDir.ensureFile(dst)
      const createdEvent = builders.event()
        .kind('file')
        .action('created')
        .path(src)
        .incomplete()
        .build()
      const renamedEvent = builders.event()
        .kind(createdEvent.kind)
        .action('renamed')
        .oldPath(src)
        .path(dst)
        .build()
      const inputBuffer = new Buffer()
      const outputBuffer = incompleteFixer.loop(inputBuffer, {syncPath, checksumer})

      inputBuffer.push([createdEvent])
      inputBuffer.push([renamedEvent])

      should(
        await outputBuffer.pop()
      ).deepEqual(
        await incompleteFixer.step(
          [{ event: createdEvent, timestamp: Date.now() }],
          {syncPath, checksumer}
        )([renamedEvent])
      )
    })
  })

  describe('.step()', () => {
    context('without any complete "renamed" event', () => {
      it('drops incomplete events', async function () {
        const { syncPath } = this

        const inputBatch = [
          builders.event().incomplete().action('created').path('foo1').build(),
          builders.event().incomplete().action('modified').path('foo2').build(),
          builders.event().incomplete().action('deleted').path('foo3').build(),
          builders.event().incomplete().action('scan').path('foo4').build()
        ]
        const incompletes = []

        const outputBatch = await incompleteFixer.step(incompletes, {syncPath, checksumer})(inputBatch)
        should(outputBatch).be.empty()
      })
    })

    context('with a complete "renamed" event', () => {
      it('leaves complete events untouched', async function () {
        const { syncPath } = this

        const src = 'file'
        const dst = 'foo'
        await syncDir.ensureFile(dst)
        const inputBatch = [
          builders.event().action('created').path(src).build(),
          builders.event().action('renamed').oldPath(src).path(dst).build()
        ]
        const incompletes = []

        const outputBatch = await incompleteFixer.step(incompletes, {syncPath, checksumer})(inputBatch)
        should(outputBatch).deepEqual(inputBatch)
      })

      it('rebuilds the first incomplete event matching the "renamed" event old path', async function () {
        const { syncPath } = this

        await syncDir.makeTree([
          'dst/',
          'dst/foo',
          'dst/foo1',
          'dst/foo2',
          'dst/foo3',
          'dst/foo5'
        ])
        const incompleteEvents = [
          builders.event().incomplete().kind('file').action('created').path('src/foo1').build(),
          builders.event().incomplete().kind('file').action('modified').path('src/foo2').build(),
          builders.event().incomplete().kind('file').action('deleted').path('src/foo3').build(),
          builders.event().incomplete().kind('file').action('renamed').oldPath('src/foo4').path('foo').build(),
          builders.event().incomplete().kind('file').action('scan').path('src/foo5').build()
        ]
        const renamedEvent = builders.event().kind('directory').action('renamed').oldPath('src').path('dst').build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [incompleteEvents, [renamedEvent]]) {
          const outputBatch = await incompleteFixer.step(incompletes, {syncPath, checksumer})(inputBatch)
          outputBatches.push(completionChanges(outputBatch))
        }

        should(outputBatches).deepEqual([
          [],
          [
            completedEvent(renamedEvent),
            {
              _id: metadata.id(path.normalize('dst/foo1')),
              oldPath: undefined,
              path: path.normalize('dst/foo1'),
              kind: 'file',
              action: 'created',
              md5sum: CHECKSUM
            }
          ]
        ])
      })

      it('replaces the completing event if its path is the same as the rebuilt one', async function () {
        const { syncPath } = this

        const src = 'missing'
        const dst = path.basename(__filename)
        await syncDir.ensureFile(dst)
        const createdEvent = builders.event()
          .kind('file')
          .action('created')
          .path(src)
          .incomplete()
          .build()
        const renamedEvent = builders.event()
          .kind(createdEvent.kind)
          .action('renamed')
          .oldPath(src)
          .path(dst)
          .build()
        const inputBatch = [createdEvent, renamedEvent]
        const incompletes = []

        const outputBatch = await incompleteFixer.step(incompletes, {syncPath, checksumer})(inputBatch)
        should(completionChanges(outputBatch)).deepEqual([
          _.defaults(
            {
              md5sum: CHECKSUM,
              oldPath: undefined
            },
            _.pick(renamedEvent, ['_id', 'path']),
            _.omit(createdEvent, ['incomplete'])
          )
        ])
      })
    })

    describe('file renamed then deleted', () => {
      it('is deleted at its original path', async function () {
        const { syncPath } = this

        const src = 'src'
        const dst = 'dst'
        const renamedEvent = builders.event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst)
          .incomplete()
          .build()
        const deletedEvent = builders.event()
          .kind(renamedEvent.kind)
          .action('deleted')
          .path(dst)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [[renamedEvent], [deletedEvent]]) {
          const outputBatch = await incompleteFixer.step(incompletes, {syncPath, checksumer})(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([
          [],
          [
            deletedEvent, // OPTIMIZE: Drop useless event
            {
              _id: metadata.id(src),
              action: 'deleted',
              incompleteFixer: {
                incompleteEvent: renamedEvent,
                completingEvent: deletedEvent
              },
              kind: renamedEvent.kind,
              path: src
            }
          ]
        ])
      })
    })

    describe('file renamed twice', () => {
      it('is renamed once as a whole', async function () {
        const { syncPath } = this

        const src = 'src'
        const dst1 = 'dst1'
        const dst2 = path.basename(__filename)
        await syncDir.ensureFile(dst2)
        const firstRenamedEvent = builders.event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst1)
          .incomplete()
          .build()
        const secondRenamedEvent = builders.event()
          .kind('file')
          .action('renamed')
          .oldPath(dst1)
          .path(dst2)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [[firstRenamedEvent], [secondRenamedEvent]]) {
          const outputBatch = await incompleteFixer.step(incompletes, {syncPath, checksumer})(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([
          [],
          [
            {
              _id: metadata.id(dst2),
              action: 'renamed',
              incompleteFixer: {
                incompleteEvent: firstRenamedEvent,
                completingEvent: secondRenamedEvent
              },
              kind: 'file',
              md5sum: CHECKSUM,
              oldPath: src,
              path: dst2,
              stats: await stater.stat(path.join(syncPath, dst2))
            }
          ]
        ])
      })
    })

    describe('file renamed and then renamed back to its previous name', () => {
      it('results in no events at all', async function () {
        const { syncPath } = this

        const src = 'src'
        const dst = 'dst'
        await syncDir.ensureFile(src)
        const firstRenamedEvent = builders.event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst)
          .incomplete()
          .build()
        const secondRenamedEvent = builders.event()
          .kind('file')
          .action('renamed')
          .oldPath(dst)
          .path(src)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [[firstRenamedEvent], [secondRenamedEvent]]) {
          const outputBatch = await incompleteFixer.step(incompletes, {syncPath, checksumer})(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([
          [],
          []
        ])
      })
    })
  })
})
