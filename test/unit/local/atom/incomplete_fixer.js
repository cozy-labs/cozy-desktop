/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const Builders = require('../../../support/builders')
const { ContextDir } = require('../../../support/helpers/context_dir')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

const stater = require('../../../../core/local/stater')
const Channel = require('../../../../core/local/atom/channel')
const incompleteFixer = require('../../../../core/local/atom/incomplete_fixer')

const CHECKSUM = 'checksum'
const checksumer = {
  push: sinon.stub().resolves(CHECKSUM),
  kill: sinon.stub()
}

const completedEvent = event => _.omit(event, ['incompleteFixer'])
const completionChanges = events => events.map(completedEvent)

describe('core/local/atom/incomplete_fixer', () => {
  let syncDir
  let builders

  before('create config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('create helpers', function () {
    syncDir = new ContextDir(this.syncPath)
    builders = new Builders({ pouch: this.pouch })
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  afterEach('clean files', function () {
    syncDir.clean()
  })
  after('cleanup config', configHelpers.cleanConfig)

  describe('.loop()', () => {
    it('pushes the result of step() into the output Channel', async function () {
      const { config } = this

      const src = 'missing'
      const dst = path.basename(__filename)
      await syncDir.ensureFile(dst)
      const createdEvent = builders
        .event()
        .kind('file')
        .action('created')
        .path(src)
        .incomplete()
        .build()
      const renamedEvent = builders
        .event()
        .kind(createdEvent.kind)
        .action('renamed')
        .oldPath(src)
        .path(dst)
        .build()
      const inputChannel = new Channel()
      const outputChannel = incompleteFixer.loop(inputChannel, {
        config,
        checksumer,
        pouch: this.pouch
      })

      inputChannel.push([createdEvent])
      inputChannel.push([renamedEvent])

      should(await outputChannel.pop()).deepEqual(
        await incompleteFixer.step(
          { incompletes: [{ event: createdEvent, timestamp: Date.now() }] },
          { config, checksumer, pouch: this.pouch }
        )([renamedEvent])
      )
    })
  })

  describe('.step()', () => {
    context('without any complete "renamed" event', () => {
      it('drops incomplete events', async function () {
        const { config } = this

        const inputBatch = [
          builders.event().incomplete().action('created').path('foo1').build(),
          builders.event().incomplete().action('modified').path('foo2').build(),
          builders.event().incomplete().action('deleted').path('foo3').build(),
          builders.event().incomplete().action('scan').path('foo4').build()
        ]
        const incompletes = []

        const outputBatch = await incompleteFixer.step(
          { incompletes },
          {
            config,
            checksumer,
            pouch: this.pouch
          }
        )(inputBatch)
        should(outputBatch).be.empty()
      })
    })

    context('with a complete "renamed" event', () => {
      it('leaves complete events untouched', async function () {
        const { config } = this

        const src = 'file'
        const dst = 'foo'
        await syncDir.ensureFile(dst)
        const inputBatch = [
          builders.event().action('created').path(src).build(),
          builders.event().action('renamed').oldPath(src).path(dst).build()
        ]
        const incompletes = []

        const outputBatch = await incompleteFixer.step(
          { incompletes },
          {
            config,
            checksumer,
            pouch: this.pouch
          }
        )(inputBatch)
        should(outputBatch).deepEqual(inputBatch)
      })

      it('rebuilds the all incomplete events matching the "renamed" event old path', async function () {
        const { config } = this

        await syncDir.makeTree([
          'dst/',
          'dst/foo',
          'dst/foo1',
          'dst/foo2',
          'dst/foo3',
          'dst/foo5'
        ])
        const incompleteEvents = [
          builders
            .event()
            .incomplete()
            .kind('file')
            .action('created')
            .path('src/foo1')
            .build(),
          builders
            .event()
            .incomplete()
            .kind('file')
            .action('modified')
            .path('src/foo2')
            .build(),
          builders
            .event()
            .incomplete()
            .kind('file')
            .action('deleted')
            .path('src/foo3')
            .build(),
          builders
            .event()
            .incomplete()
            .kind('file')
            .action('renamed')
            .oldPath('src/foo4')
            .path('foo')
            .build(),
          builders
            .event()
            .incomplete()
            .kind('file')
            .action('scan')
            .path('src/foo5')
            .build()
        ]
        const renamedEvent = builders
          .event()
          .kind('directory')
          .action('renamed')
          .oldPath('src')
          .path('dst')
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [incompleteEvents, [renamedEvent]]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch: this.pouch
            }
          )(inputBatch)
          outputBatches.push(completionChanges(outputBatch))
        }

        should(outputBatches).deepEqual([
          [],
          [
            renamedEvent,
            {
              path: path.normalize('dst/foo1'),
              kind: 'file',
              action: 'created',
              md5sum: CHECKSUM,
              stats: await stater.stat(path.join(config.syncPath, 'dst/foo1'))
            },
            {
              path: path.normalize('dst/foo2'),
              kind: 'file',
              action: 'modified',
              md5sum: CHECKSUM,
              stats: await stater.stat(path.join(config.syncPath, 'dst/foo2'))
            },
            {
              path: path.normalize('dst/foo3'),
              kind: 'file',
              action: 'deleted',
              md5sum: CHECKSUM,
              stats: await stater.stat(path.join(config.syncPath, 'dst/foo3'))
            },
            {
              path: path.normalize('dst/foo5'),
              kind: 'file',
              action: 'scan',
              md5sum: CHECKSUM,
              stats: await stater.stat(path.join(config.syncPath, 'dst/foo5'))
            }
          ]
        ])
      })

      it('drops incomplete ignored events matching the "renamed" event old path', async function () {
        const { config } = this

        await syncDir.makeTree(['dst/', 'dst/file'])
        const ignoredEvent = builders
          .event()
          .incomplete()
          .action('ignored')
          .path('src/file')
          .build()
        const renamedEvent = builders
          .event()
          .action('renamed')
          .oldPath('src')
          .path('dst')
          .build()
        const incompletes = []

        const outputBatch = await incompleteFixer.step(
          { incompletes },
          {
            config,
            checksumer,
            pouch: this.pouch
          }
        )([ignoredEvent, renamedEvent])
        should(outputBatch).deepEqual([renamedEvent])
      })

      it('replaces the completing event if its path is the same as the rebuilt one', async function () {
        const { config } = this

        const src = 'missing'
        const dst = path.basename(__filename)
        await syncDir.ensureFile(dst)
        const createdEvent = builders
          .event()
          .kind('file')
          .action('created')
          .path(src)
          .incomplete()
          .build()
        const renamedEvent = builders
          .event()
          .kind(createdEvent.kind)
          .action('renamed')
          .oldPath(src)
          .path(dst)
          .build()
        const inputBatch = [createdEvent, renamedEvent]
        const incompletes = []

        const outputBatch = await incompleteFixer.step(
          { incompletes },
          {
            config,
            checksumer,
            pouch: this.pouch
          }
        )(inputBatch)
        should(completionChanges(outputBatch)).deepEqual([
          {
            path: renamedEvent.path,
            md5sum: CHECKSUM,
            stats: await stater.stat(
              path.join(config.syncPath, renamedEvent.path)
            ),
            action: createdEvent.action,
            kind: createdEvent.kind
          }
        ])
      })
    })

    describe('file renamed then deleted', () => {
      it('is deleted at its original path', async function () {
        const { config } = this

        const src = 'src'
        const dst = 'dst'
        const renamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst)
          .incomplete()
          .build()
        const deletedEvent = builders
          .event()
          .kind(renamedEvent.kind)
          .action('deleted')
          .path(dst)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [[renamedEvent], [deletedEvent]]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch: this.pouch
            }
          )(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([
          [],
          [
            {
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
        const { config } = this

        const src = 'src'
        const dst1 = 'dst1'
        const dst2 = path.basename(__filename)
        await syncDir.ensureFile(dst2)

        const firstRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst1)
          .incomplete()
          .build()
        const secondRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(dst1)
          .path(dst2)
          .build()
        const stats = await stater.stat(path.join(config.syncPath, dst2))
        secondRenamedEvent.stats = stats

        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [[firstRenamedEvent], [secondRenamedEvent]]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch: this.pouch
            }
          )(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([
          [],
          [
            {
              action: 'renamed',
              incompleteFixer: {
                incompleteEvent: firstRenamedEvent,
                completingEvent: secondRenamedEvent
              },
              kind: 'file',
              md5sum: CHECKSUM,
              oldPath: src,
              path: dst2,
              stats: secondRenamedEvent.stats
            }
          ]
        ])
      })
    })

    describe('file renamed three times', () => {
      it('is renamed once as a whole', async function () {
        const { config } = this

        const src = 'src'
        const dst1 = 'dst1'
        const dst2 = 'dst2'
        const dst3 = path.basename(__filename)
        await syncDir.ensureFile(dst3)
        const firstRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst1)
          .incomplete()
          .build()
        const secondRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(dst1)
          .path(dst2)
          .incomplete()
          .build()
        const thirdRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(dst2)
          .path(dst3)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [
          [firstRenamedEvent],
          [secondRenamedEvent],
          [thirdRenamedEvent]
        ]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch: this.pouch
            }
          )(inputBatch)
          outputBatches.push(completionChanges(outputBatch))
        }

        should(outputBatches).deepEqual([
          [],
          [],
          [
            {
              action: 'renamed',
              kind: 'file',
              md5sum: CHECKSUM,
              oldPath: src,
              path: dst3,
              stats: await stater.stat(path.join(config.syncPath, dst3))
            }
          ]
        ])
      })
    })

    describe('file renamed and then renamed back to its previous name', () => {
      it('results in no events at all', async function () {
        const { config } = this

        const src = 'src'
        const dst = 'dst'
        await syncDir.ensureFile(src)
        const firstRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst)
          .incomplete()
          .build()
        const secondRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(dst)
          .path(src)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [[firstRenamedEvent], [secondRenamedEvent]]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch: this.pouch
            }
          )(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([[], []])
      })
    })

    describe('file renamed to backup location and replaced by new file', () => {
      it('is modified once and not deleted', async function () {
        const { config } = this

        const src = 'src'
        const tmp = 'src.tmp'
        await syncDir.ensureFile(src)
        const renamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(tmp)
          .incomplete()
          .build()
        const createdEvent = builders
          .event()
          .kind('file')
          .action('created')
          .path(src)
          .md5sum(CHECKSUM)
          .build()
        const stats = createdEvent.stats
        const deletedEvent = builders
          .event()
          .kind('file')
          .action('deleted')
          .path(tmp)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [
          [renamedEvent],
          [createdEvent],
          [deletedEvent]
        ]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch: this.pouch
            }
          )(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([
          [],
          [
            {
              action: 'modified',
              kind: 'file',
              md5sum: CHECKSUM,
              path: src,
              incompleteFixer: {
                incompleteEvent: renamedEvent,
                completingEvent: createdEvent
              },
              stats
            }
          ],
          [
            {
              action: 'deleted',
              kind: 'file',
              path: tmp
            }
          ]
        ])
      })
    })

    describe('incomplete created for merged file then renamed', () => {
      const src = 'src'
      const dst = 'dst'

      beforeEach(async function () {
        await builders.metafile().path(src).sides({ local: 1 }).create()
      })

      it('results in the renamed event', async function () {
        const { config, pouch } = this

        await syncDir.ensureFile(dst)
        const createdEvent = builders
          .event()
          .kind('file')
          .action('created')
          .path(src)
          .incomplete()
          .build()
        const renamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [[createdEvent], [renamedEvent]]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch
            }
          )(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([[], [renamedEvent]])
      })
    })

    describe('incomplete modified for merged file then renamed', () => {
      const src = 'src'
      const dst = 'dst'

      beforeEach(async function () {
        await builders.metafile().path(src).sides({ local: 1 }).create()
      })

      it('results in the renamed event followed by the rebuilt modified event', async function () {
        const { config, pouch } = this

        await syncDir.ensureFile(dst)
        const modifiedEvent = builders
          .event()
          .kind('file')
          .action('modified')
          .path(src)
          .incomplete()
          .build()
        const renamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [[modifiedEvent], [renamedEvent]]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch
            }
          )(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([
          [],
          [
            renamedEvent,
            {
              action: 'modified',
              incompleteFixer: {
                incompleteEvent: modifiedEvent,
                completingEvent: renamedEvent
              },
              kind: 'file',
              md5sum: CHECKSUM,
              path: dst,
              stats: await stater.stat(path.join(config.syncPath, dst))
            }
          ]
        ])
      })
    })

    describe('incomplete modified for merged file then renamed twice', () => {
      const src = 'src'
      const dst1 = 'dst1'
      const dst2 = 'dst2'

      beforeEach(async function () {
        await builders.metafile().path(src).sides({ local: 1 }).create()
      })

      it('results in one renamed event followed by the rebuilt modified event', async function () {
        const { config, pouch } = this

        await syncDir.ensureFile(dst2)
        const modifiedEvent = builders
          .event()
          .kind('file')
          .action('modified')
          .path(src)
          .incomplete()
          .build()
        const firstRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(src)
          .path(dst1)
          .incomplete()
          .build()
        const secondRenamedEvent = builders
          .event()
          .kind('file')
          .action('renamed')
          .oldPath(dst1)
          .path(dst2)
          .build()
        const incompletes = []
        const outputBatches = []

        for (const inputBatch of [
          [modifiedEvent],
          [firstRenamedEvent],
          [secondRenamedEvent]
        ]) {
          const outputBatch = await incompleteFixer.step(
            { incompletes },
            {
              config,
              checksumer,
              pouch
            }
          )(inputBatch)
          outputBatches.push(outputBatch)
        }

        should(outputBatches).deepEqual([
          [],
          [],
          [
            {
              action: 'renamed',
              incompleteFixer: {
                incompleteEvent: firstRenamedEvent,
                completingEvent: secondRenamedEvent
              },
              kind: 'file',
              md5sum: CHECKSUM,
              oldPath: src,
              path: dst2,
              stats: await stater.stat(path.join(config.syncPath, dst2))
            },
            {
              action: 'modified',
              incompleteFixer: {
                incompleteEvent: {
                  ...modifiedEvent,
                  path: dst1,
                  md5sum: undefined,
                  incompleteFixer: {
                    incompleteEvent: modifiedEvent,
                    completingEvent: firstRenamedEvent
                  }
                },
                completingEvent: secondRenamedEvent
              },
              kind: 'file',
              md5sum: CHECKSUM,
              path: dst2,
              stats: await stater.stat(path.join(config.syncPath, dst2))
            }
          ]
        ])
      })
    })
  })
})
