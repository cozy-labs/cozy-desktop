/* eslint-env mocha */
/* @flow */

import should from 'should'

import { PendingMap } from '../../../src/utils/pending'

import type { Pending } from '../../../src/utils/pending' // eslint-disable-line

describe('utils/pending/PendingMap', () => {
  let map
  const whatever: Pending = {
    execute: () => {},
    stopChecking: () => {}
  }

  describe('hasPendingChild', function () {
    beforeEach(() => { map = new PendingMap() })

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
