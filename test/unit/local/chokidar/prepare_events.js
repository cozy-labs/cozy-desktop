/* eslint-env mocha */

const should = require('should')

const prepareEvents = require('../../../../core/local/chokidar/prepare_events')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')
const { onPlatform } = require('../../../support/helpers/platform')

onPlatform('darwin', () => {
  describe('core/local/chokidar_steps/prepare_events', () => {
    let builders

    before('instanciate config', configHelpers.createConfig)
    beforeEach('instanciate pouch', pouchHelpers.createDatabase)

    beforeEach('set up builders', function() {
      builders = new Builders({ pouch: this.pouch })
    })

    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    describe('#oldMetadata()', () => {
      it('resolves with the metadata whose id matches the event path', async function() {
        const old = await builders.metadata().create()
        const resultByEventType = {}
        for (let type of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
          resultByEventType[type] = await prepareEvents.oldMetadata(
            {
              type,
              path: old.path
            },
            this.pouch
          )
        }
        should(resultByEventType).deepEqual({
          add: old,
          addDir: old,
          change: old,
          unlink: old,
          unlinkDir: old
        })
      })
    })

    describe('step', () => {
      const accentuatedName = 'AccuséRéception.pdf'
      const nonAccentuatedName = 'AccuseReception.pdf'

      let step
      beforeEach(function() {
        step = (event, existing) =>
          prepareEvents.step([event], {
            checksum: () => existing.md5sum,
            pouch: this.pouch,
            syncPath: this.syncPath
          })
      })

      context('with existing document name normalized with NFC', () => {
        it('normalizes accentuated, NFD event doc name to NFC', async function() {
          const existing = await builders
            .metafile()
            .path(accentuatedName.normalize('NFC'))
            .data('content')
            .upToDate()
            .create()
          const event = { type: 'add', path: existing.path.normalize('NFD') }
          should(await step(event, existing)).deepEqual([
            {
              type: 'add',
              path: existing.path,
              old: existing,
              md5sum: existing.md5sum
            }
          ])
        })

        it('does not normalize non-accentuated event doc name to NFC', async function() {
          const existing = await builders
            .metafile()
            .path(nonAccentuatedName.normalize('NFC'))
            .data('content')
            .upToDate()
            .create()
          const event = { type: 'add', path: existing.path }
          should(await step(event, existing)).deepEqual([
            {
              type: 'add',
              path: existing.path,
              old: existing,
              md5sum: existing.md5sum
            }
          ])
        })
      })

      context('with existing document name normalized with NFD', () => {
        it('does not normalize NFD event doc name to NFC', async function() {
          const existing = await builders
            .metafile()
            .path(accentuatedName.normalize('NFD'))
            .data('content')
            .upToDate()
            .create()
          const event = { type: 'add', path: existing.path }
          should(await step(event, existing)).deepEqual([
            {
              type: 'add',
              path: existing.path,
              old: existing,
              md5sum: existing.md5sum
            }
          ])
        })

        it('does not normalize non-accentuated event doc name to NFC', async function() {
          const existing = await builders
            .metafile()
            .path(nonAccentuatedName.normalize('NFD'))
            .data('content')
            .upToDate()
            .create()
          const event = { type: 'add', path: existing.path }
          should(await step(event, existing)).deepEqual([
            {
              type: 'add',
              path: existing.path,
              old: existing,
              md5sum: existing.md5sum
            }
          ])
        })
      })
    })
  })
})
