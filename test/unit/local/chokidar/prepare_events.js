/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const prepareEvents = require('../../../../core/local/chokidar/prepare_events')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')
const { onPlatform } = require('../../../support/helpers/platform')

onPlatform('darwin', () => {
  describe('core/local/chokidar_steps/prepare_events', () => {
    let builders

    before('instanciate config', configHelpers.createConfig)
    before('instanciate pouch', pouchHelpers.createDatabase)

    beforeEach('set up builders', function() {
      builders = new Builders({ pouch: this.pouch })
    })

    after('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    describe('#oldMetadata()', () => {
      it('resolves with the metadata whose id matches the event path', async function() {
        const old = await builders
          .metadata()
          .upToDate()
          .create()
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

    describe('#step()', () => {
      it('does not compute checksum of untouched file', async function() {
        const untouched = await builders
          .metafile()
          .path('untouched')
          .data('initial')
          .upToDate()
          .create()
        const sameContent = await builders
          .metafile()
          .path('sameContent')
          .data('initial')
          .upToDate()
          .create()
        const events /*: ChokidarEvent[] */ = [
          {
            type: 'add',
            path: untouched.path,
            old: untouched,
            stats: {
              mtime: new Date(untouched.updated_at)
            }
          },
          {
            type: 'change',
            path: sameContent.path,
            old: sameContent,
            stats: {
              mtime: new Date(sameContent.updated_at)
            }
          }
        ]

        const checksum = sinon.spy()
        await prepareEvents.step(events, {
          checksum,
          initialScanParams: { flushed: false },
          pouch: this.pouch,
          syncPath: this.config.syncPath
        })
        should(checksum).not.have.been.called()
      })

      it('does not compute checksum after only a path normalization change', async function() {
        const old = await builders
          .metafile()
          .path('énoncé'.normalize('NFC'))
          .data('initial')
          .upToDate()
          .create()
        const events /*: ChokidarEvent[] */ = [
          {
            type: 'add',
            path: old.path.normalize('NFD'),
            old,
            stats: {
              mtime: new Date(old.updated_at)
            }
          }
        ]

        const checksum = sinon.spy()
        await prepareEvents.step(events, {
          checksum,
          initialScanParams: { flushed: false },
          pouch: this.pouch,
          syncPath: this.config.syncPath
        })
        should(checksum).not.have.been.called()
      })
    })
  })
})
