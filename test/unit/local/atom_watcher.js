/* eslint-env mocha */
/* @flow */

const should = require('should')

const AtomWatcher = require('../../../core/local/atom_watcher')
const initialDiff = require('../../../core/local/steps/initial_diff')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')

console.log(initialDiff.STEP_NAME)

describe('core/local/atom_watcher', () => {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('.stepsInitialState()', () => {
    it('includes initial diff state key', async function() {
      const state = {}
      const initialState = await AtomWatcher.stepsInitialState(state, this)
      should(state).have.property(initialDiff.STEP_NAME)
      should(initialState).have.property(initialDiff.STEP_NAME)
    })
  })
})
