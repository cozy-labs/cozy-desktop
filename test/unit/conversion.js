/* @flow */
/* eslint-env mocha */

const should = require('should')
const path = require('path')

const conversion = require('../../core/conversion')
describe('conversion', function () {
  describe('extractDirAndName', () => {
    it('returns the remote path and name', function () {
      let [dir, name] = conversion.extractDirAndName('foo')
      should(dir).equal('/')
      should(name).equal('foo');
      [dir, name] = conversion.extractDirAndName(path.normalize('foo/bar'))
      should(dir).equal('/foo')
      should(name).equal('bar');
      [dir, name] = conversion.extractDirAndName(path.normalize('foo/bar/baz'))
      should(dir).equal('/foo/bar')
      should(name).equal('baz')
    })
  })
})
