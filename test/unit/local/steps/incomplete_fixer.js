/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const metadata = require('../../../../core/metadata')
const stater = require('../../../../core/local/stater')
const Buffer = require('../../../../core/local/steps/buffer')
const incompleteFixer = require('../../../../core/local/steps/incomplete_fixer')

const Builders = require('../../../support/builders')
const { ContextDir } = require('../../../support/helpers/context_dir')

const syncPath = __dirname
const syncDir = new ContextDir(syncPath)
const CHECKSUM = 'checksum'
const checksumer = {
  push: sinon.stub().resolves(CHECKSUM),
  kill: sinon.stub()
}
const builders = new Builders()

const completedEvent = event =>
  _.omit(event, ['stats', 'incompleteFixer'])
const completionChanges = events => events.map(completedEvent)

describe('core/local/steps/incomplete_fixer', () => {
  describe('.loop()', () => {
    it('pushes the result of step() into the output buffer', async () => {
      const createdEvent = builders.event()
        .kind('file')
        .action('created')
        .path('missing')
        .incomplete()
        .build()
      const renamedEvent = builders.event()
        .kind(createdEvent.kind)
        .action('renamed')
        .oldPath(createdEvent.path)
        .path(path.basename(__filename))
        .build()
      const inputBuffer = new Buffer()
      const outputBuffer = incompleteFixer.loop(inputBuffer, {syncPath, checksumer})

      inputBuffer.push([createdEvent])
      inputBuffer.push([renamedEvent])

      should(
        await outputBuffer.pop()
      ).deepEqual(
        await incompleteFixer.step(
          [{ event: createdEvent, timestamp: (new Date()) }],
          {syncPath, checksumer}
        )([renamedEvent])
      )
    })
  })

  describe('.step()', () => {
    context('without any complete "renamed" event', () => {
      it('drops incomplete events', async function () {
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

    context('with a complete "renamed" event in a later batch', () => {
      it('leaves complete events untouched', async function () {
        const inputBatch = [
          builders.event().action('created').path('file').build(),
          builders.event().action('renamed').oldPath('file').path('foo').build()
        ]
        const incompletes = []

        const outputBatch = await incompleteFixer.step(incompletes, {syncPath, checksumer})(inputBatch)
        should(outputBatch).deepEqual(inputBatch)
      })

      it('rebuilds the first incomplete event matching the "renamed" event old path', async function () {
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

        // Create actual files in `dst/` since their parent folder has been moved
        await syncDir.makeTree([
          'dst/',
          'dst/foo',
          'dst/foo1',
          'dst/foo2',
          'dst/foo3',
          'dst/foo5'
        ])

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
        const createdEvent = builders.event()
          .kind('file')
          .action('created')
          .path('missing')
          .incomplete()
          .build()
        const renamedEvent = builders.event()
          .kind(createdEvent.kind)
          .action('renamed')
          .oldPath(createdEvent.path)
          .path(path.basename(__filename))
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
      it('is deleted at its original path', async () => {
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
      it('is renamed once as a whole', async () => {
        const src = 'src'
        const dst1 = 'dst1'
        const dst2 = path.basename(__filename)
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
        const md5sum = 'whatever'

        checksumer.push.resolves(md5sum)

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
              md5sum,
              oldPath: src,
              path: dst2,
              stats: await stater.stat(path.join(syncPath, dst2))
            }
          ]
        ])
      })
    })
  })
})
