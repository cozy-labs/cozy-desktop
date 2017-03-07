/* eslint-env mocha */
/* @flow */

import should from 'should'

import { PendingMap } from '../../../src/utils/pending'

import type { Pending } from '../../../src/utils/pending' // eslint-disable-line

describe('utils/pending/PendingMap', () => {
  let map
  beforeEach(() => { map = new PendingMap() })

  const whatever: Pending = {
    execute: () => {},
    stopChecking: () => {}
  }

  describe('hasParentPath', function () {
    it('is true when parent dir of the given path has some pending operation', () => {
      should(map.hasParentPath('')).be.false()
      should(map.hasParentPath('foo')).be.false()
      should(map.hasParentPath('foo/bar')).be.false()

      map.add('foo', whatever)
      map.add('foo/bar', whatever)

      should(map.hasParentPath('')).be.false()
      should(map.hasParentPath('foo')).be.false()
      should(map.hasParentPath('foo/missing/whatever')).be.false()
      should(map.hasParentPath('foo/bar')).be.true()
      should(map.hasParentPath('foo/missing')).be.true()
      should(map.hasParentPath('foo/bar/missing')).be.true()
      should(map.hasParentPath('missing')).be.false()
    })
  })

  describe('hasPendingChild', function () {
    it('returns true if a sub-folder is pending', function () {
      map.add('bar', whatever)
      map.add('foo/bar', whatever)
      map.add('zoo', whatever)
      should(map.hasPendingChild('foo')).be.true()
      map.add('foo/baz/bim', whatever)
      should(map.hasPendingChild('foo/baz')).be.true()
    })

    it('returns false else', function () {
      should(map.hasPendingChild('foo')).be.false()
      map.add('foo', whatever)
      map.add('bar/baz', whatever)
      should(map.hasPendingChild('foo')).be.false()
    })
  })
})
