/* eslint-env mocha */

import * as conversion from '../../src/conversion'

describe('conversion', function () {
  describe('extractDirAndName', () =>
    it('returns the remote path and name', function () {
      let [path, name] = conversion.extractDirAndName('foo')
      path.should.equal('/')
      name.should.equal('foo');
      [path, name] = conversion.extractDirAndName('foo/bar')
      path.should.equal('/foo')
      name.should.equal('bar');
      [path, name] = conversion.extractDirAndName('foo/bar/baz')
      path.should.equal('/foo/bar')
      name.should.equal('baz')
    })
  )
})
