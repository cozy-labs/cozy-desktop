/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')
const move = require('../../core/move')
const MetadataBuilders = require('../support/builders/metadata')

const builders = new MetadataBuilders()

describe('move', () => {
  describe('.child()', () => {
    it('ensures destination will be moved as part of its ancestor directory', () => {
      const src = builders.whatever().path('whatever/src').build()
      const dst = _.defaults({path: 'whatever/dst'}, src)

      move.child(src, dst)

      should(dst).have.propertyByPath('moveFrom', 'childMove').eql(true)
    })
  })
})
