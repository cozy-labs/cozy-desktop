/* eslint-env mocha */

import { buildId, invalidChecksum, invalidPath } from '../../src/metadata'

describe('metadata', function () {
  describe('buildId', function () {
    it('is available', function () {
      let doc = {path: 'FOO'}
      buildId(doc)
      doc._id.should.equal('FOO')
    })

    if (['linux', 'freebsd', 'sunos'].includes(process.platform)) {
      it('is case insensitive on UNIX', function () {
        let doc = {path: 'foo/bar/café'}
        buildId(doc)
        doc._id.should.equal('foo/bar/café')
      })
    }

    if (process.platform === 'darwin') {
      it('is case sensitive on OSX', function () {
        let doc = {path: 'foo/bar/café'}
        buildId(doc)
        doc._id.should.equal('FOO/BAR/CAFÉ')
      })
    }
  })

  describe('invalidPath', function () {
    it('returns true if the path is incorrect', function () {
      let ret = invalidPath({path: '/'})
      ret.should.be.true()
      ret = invalidPath({path: ''})
      ret.should.be.true()
      ret = invalidPath({path: '.'})
      ret.should.be.true()
      ret = invalidPath({path: '..'})
      ret.should.be.true()
      ret = invalidPath({path: '../foo/bar.png'})
      ret.should.be.true()
      ret = invalidPath({path: 'foo/..'})
      ret.should.be.true()
      ret = invalidPath({path: 'f/../oo/../../bar/./baz'})
      ret.should.be.true()
    })

    it('returns false if everything is OK', function () {
      let ret = invalidPath({path: 'foo'})
      ret.should.be.false()
      ret = invalidPath({path: 'foo/bar'})
      ret.should.be.false()
      ret = invalidPath({path: 'foo/bar/baz.jpg'})
      ret.should.be.false()
    })

    it('returns false for paths with a leading slash', function () {
      let ret = invalidPath({path: '/foo/bar'})
      ret.should.be.false()
      ret = invalidPath({path: '/foo/bar/baz.bmp'})
      ret.should.be.false()
    })
  })

  describe('invalidChecksum', function () {
    it('returns false if the checksum is missing', function () {
      let ret = invalidChecksum({})
      ret.should.be.false()
      ret = invalidChecksum({checksum: null})
      ret.should.be.false()
      ret = invalidChecksum({checksum: undefined})
      ret.should.be.false()
    })

    it('returns true if the checksum is incorrect', function () {
      let ret = invalidChecksum({checksum: ''})
      ret.should.be.true()
      ret = invalidChecksum({checksum: 'f00'})
      ret.should.be.true()
      let sha1 = '68b329da9893e34099c7d8ad5cb9c94068b329da'
      ret = invalidChecksum({checksum: sha1})
      ret.should.be.true()
      let md5hex = 'adc83b19e793491b1c6ea0fd8b46cd9f'
      ret = invalidChecksum({checksum: md5hex})
      ret.should.be.true()
      let md5base64truncated = 'rcg7GeeTSRscbqD9i0bNn'
      ret = invalidChecksum({checksum: md5base64truncated})
      ret.should.be.true()
      let sha1base64 = 'aLMp2piT40CZx9itXLnJQGizKdo='
      ret = invalidChecksum({checksum: sha1base64})
      ret.should.be.true()
      let md5base64NonPadded = 'rcg7GeeTSRscbqD9i0bNnw'
      ret = invalidChecksum({checksum: md5base64NonPadded})
      ret.should.be.true()
    })

    it('returns false if the checksum is OK', function () {
      let doc = {checksum: 'rcg7GeeTSRscbqD9i0bNnw=='}
      let ret = invalidChecksum(doc)
      ret.should.be.false()
    })
  })
})
