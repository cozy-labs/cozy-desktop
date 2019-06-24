/* eslint-env mocha */

const should = require('should')

const prepareEvents = require('../../../../core/local/chokidar/prepare_events')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

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
})
