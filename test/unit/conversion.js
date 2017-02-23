/* @flow */
/* eslint-env mocha */

import should from 'should'

import * as conversion from '../../src/conversion'

describe('conversion', function () {
  describe('extractDirAndName', () =>
    it('returns the remote path and name', function () {
      let [path, name] = conversion.extractDirAndName('foo')
      should(path).equal('/')
      should(name).equal('foo');
      [path, name] = conversion.extractDirAndName('foo/bar')
      should(path).equal('/foo')
      should(name).equal('bar');
      [path, name] = conversion.extractDirAndName('foo/bar/baz')
      should(path).equal('/foo/bar')
      should(name).equal('baz')
    })
  )
})
