  describe('invalidPath', function () {
    it('returns true if the path is incorrect', function () {
      let ret = this.prep.invalidPath({path: '/'})
      ret.should.be.true()
      ret = this.prep.invalidPath({path: ''})
      ret.should.be.true()
      ret = this.prep.invalidPath({path: '.'})
      ret.should.be.true()
      ret = this.prep.invalidPath({path: '..'})
      ret.should.be.true()
      ret = this.prep.invalidPath({path: '../foo/bar.png'})
      ret.should.be.true()
      ret = this.prep.invalidPath({path: 'foo/..'})
      ret.should.be.true()
      ret = this.prep.invalidPath({path: 'f/../oo/../../bar/./baz'})
      ret.should.be.true()
    })

    it('returns false if everything is OK', function () {
      let ret = this.prep.invalidPath({path: 'foo'})
      ret.should.be.false()
      ret = this.prep.invalidPath({path: 'foo/bar'})
      ret.should.be.false()
      ret = this.prep.invalidPath({path: 'foo/bar/baz.jpg'})
      ret.should.be.false()
    })

    it('returns false for paths with a leading slash', function () {
      let ret = this.prep.invalidPath({path: '/foo/bar'})
      ret.should.be.false()
      ret = this.prep.invalidPath({path: '/foo/bar/baz.bmp'})
      ret.should.be.false()
    })
  })

  describe('invalidChecksum', function () {
    it('returns false if the checksum is missing', function () {
      let ret = this.prep.invalidChecksum({})
      ret.should.be.false()
      ret = this.prep.invalidChecksum({checksum: null})
      ret.should.be.false()
      ret = this.prep.invalidChecksum({checksum: undefined})
      ret.should.be.false()
    })

    it('returns true if the checksum is incorrect', function () {
      let ret = this.prep.invalidChecksum({checksum: ''})
      ret.should.be.true()
      ret = this.prep.invalidChecksum({checksum: 'f00'})
      ret.should.be.true()
      let sha1 = '68b329da9893e34099c7d8ad5cb9c94068b329da'
      ret = this.prep.invalidChecksum({checksum: sha1})
      ret.should.be.true()
      let md5hex = 'adc83b19e793491b1c6ea0fd8b46cd9f'
      ret = this.prep.invalidChecksum({checksum: md5hex})
      ret.should.be.true()
      let md5base64truncated = 'rcg7GeeTSRscbqD9i0bNn'
      ret = this.prep.invalidChecksum({checksum: md5base64truncated})
      ret.should.be.true()
      let sha1base64 = 'aLMp2piT40CZx9itXLnJQGizKdo='
      ret = this.prep.invalidChecksum({checksum: sha1base64})
      ret.should.be.true()
      let md5base64NonPadded = 'rcg7GeeTSRscbqD9i0bNnw'
      ret = this.prep.invalidChecksum({checksum: md5base64NonPadded})
      ret.should.be.true()
    })

    it('returns false if the checksum is OK', function () {
      let doc = {checksum: 'rcg7GeeTSRscbqD9i0bNnw=='}
      let ret = this.prep.invalidChecksum(doc)
      ret.should.be.false()
    })
  })
