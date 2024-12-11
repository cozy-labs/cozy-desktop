/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')

const {
  ChannelWatcher,
  stepsInitialState
} = require('../../../../core/local/channel_watcher')
const initialDiff = require('../../../../core/local/channel_watcher/initial_diff')
const configHelpers = require('../../../support/helpers/config')
const TestHelpers = require('../../../support/helpers/index')
const { onPlatforms } = require('../../../support/helpers/platform')
const pouchHelpers = require('../../../support/helpers/pouch')

onPlatforms(['linux', 'win32'], () => {
  describe('core/local/channel_watcher/watcher', () => {
    before('instanciate config', configHelpers.createConfig)
    before('register client', configHelpers.registerClient)
    before('instanciate pouch', pouchHelpers.createDatabase)
    after('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    describe('.stepsInitialState()', () => {
      it('includes initial diff state key', async function() {
        const state = {}
        const initialState = await stepsInitialState(state, this)
        should(state).have.property(initialDiff.STEP_NAME)
        should(initialState).have.property(initialDiff.STEP_NAME)
      })
    })

    describe('start', () => {
      let helpers
      beforeEach('init helpers', async function() {
        helpers = TestHelpers.init(this)
      })

      context('when producer.start() rejects', () => {
        it('should reject with the same error', async function() {
          const watcher = new ChannelWatcher({
            ...helpers,
            config: this.config,
            ignore: helpers._sync.ignore,
            syncPath: this.config.syncPath
          })

          const error = new Error('producer start error')
          sinon.stub(watcher.producer, 'start').rejects(error)

          await should(watcher.start()).be.rejectedWith(error)
        })
      })
    })
  })
})
