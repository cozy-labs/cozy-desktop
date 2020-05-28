/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')
const move = require('../../core/move')
const Builders = require('../support/builders')

const builders = new Builders()

describe('move', () => {
  it('transfers all src attributes not already defined in dst', () => {
    const src = builders
      .metafile()
      .path('src/file')
      .data('hello')
      .tags('qux')
      .sides({ local: 2, remote: 1 })
      .build()
    src.metadata = {
      test: 'kept metadata'
    }
    const dst = builders
      .metafile()
      .path('dst/file')
      .noRemote()
      .noTags()
      .build()
    should(dst.metadata).be.undefined()

    move('local', src, dst)

    should(dst).have.properties({
      metadata: src.metadata,
      tags: src.tags,
      remote: src.remote
    })
    // PouchDB reserved attributes are not transfered
    should(dst._id).not.eql(src._id)
    should(dst._deleted).be.undefined()
    should(dst._rev).be.undefined()
    // defined attributes are not overwritten
    should(dst).not.have.property('_deleted')
    should(dst.md5sum).not.eql(src.md5sum)
    should(dst.size).not.eql(src.size)
  })

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
