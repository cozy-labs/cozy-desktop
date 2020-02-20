/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')

const {
  AtomWatcher,
  stepsInitialState
} = require('../../../../core/local/atom/watcher')
const initialDiff = require('../../../../core/local/atom/initial_diff')

const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')
const TestHelpers = require('../../../support/helpers/index')
const { onPlatforms } = require('../../../support/helpers/platform')

onPlatforms(['linux', 'win32'], () => {
  describe('core/local/atom/watcher', () => {
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
          const watcher = new AtomWatcher({
            ...helpers,
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
