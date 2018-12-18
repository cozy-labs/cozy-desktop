/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')
const move = require('../../core/move')
const Builders = require('../support/builders')

const builders = new Builders()

describe('move', () => {
  describe('.child()', () => {
    it('ensures destination will be moved as part of its ancestor directory', () => {
      const src = builders.metadata().path('whatever/src').build()
      const dst = _.defaults({path: 'whatever/dst'}, src)

      move.child(src, dst)

      should(dst).have.propertyByPath('moveFrom', 'childMove').eql(true)
    })
  })
})
