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
      const src = builders
        .metadata()
        .path('whatever/src')
        .build()
      const dst = _.defaults({ path: 'whatever/dst' }, src)

      move.child('local', src, dst)

      should(dst)
        .have.propertyByPath('moveFrom', 'childMove')
        .eql(true)
    })
  })

  describe('convertToDestinationAddition', () => {
    const side = 'local'
    let src, dst

    beforeEach(() => {
      src = builders
        .metadata()
        .path('src')
        .upToDate()
        .build()
      dst = builders
        .metadata(src)
        .path('destination')
        .build()

      move(side, src, dst)
      move.convertToDestinationAddition(side, src, dst)
    })

    it('deletes the source document', () => {
      should(src._deleted).be.true()
    })

    it('marks the destination document as newly added on `side`', () => {
      should(dst.sides).deepEqual({ target: 1, [side]: 1 })
    })

    it('removes move hints on both documents', () => {
      should(src).not.have.property('moveTo')
      should(dst).not.have.property('moveFrom')
    })
  })
})
