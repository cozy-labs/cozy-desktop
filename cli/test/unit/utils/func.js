/* @flow */
/* eslint-env mocha */

import should from 'should'

import { composeAsync } from '../../../src/utils/func'

describe('utils', () => {
  describe('composeAsync', () => {
    it('returns an async function composed of the given async functions', async function () {
      const f1 = async function (x, y) { return x + y }
      const f2 = async function (x) { return x * 2 }

      const composed = composeAsync(f1, f2)
      const result = await composed(1, 2)

      should(result).equal(6)
    })
  })
})
