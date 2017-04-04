/* eslint-env mocha */

import clone from 'lodash.clone'
import should from 'should'

import {
  buildId, extractRevNumber, invalidChecksum, invalidPath, markSide,
  sameBinary, sameFile, sameFolder
} from '../../src/metadata'

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
    should.Assertion.add('invalidPath', function() {
      this.params = {operator: 'to make metadata.invalidPath() return', expected: true}
      should(invalidPath(this.obj)).be.exactly(true)
    })

    it('returns true if the path is incorrect', function () {
      should({path: '/'}).have.invalidPath()
      should({path: ''}).have.invalidPath()
      should({path: '.'}).have.invalidPath()
      should({path: '..'}).have.invalidPath()
      should({path: '../foo/bar.png'}).have.invalidPath()
      should({path: 'foo/..'}).have.invalidPath()
      should({path: 'f/../oo/../../bar/./baz'}).have.invalidPath()
    })

    it('returns false if everything is OK', function () {
      should({path: 'foo'}).not.have.invalidPath()
      should({path: 'foo/bar'}).not.have.invalidPath()
      should({path: 'foo/bar/baz.jpg'}).not.have.invalidPath()
    })

    it('returns false for paths with a leading slash', function () {
      should({path: '/foo/bar'}).not.have.invalidPath()
      should({path: '/foo/bar/baz.bmp'}).not.have.invalidPath()
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

  describe('extractRevNumber', function () {
    it('extracts the revision number', function () {
      let infos = {_rev: '42-0123456789'}
      extractRevNumber(infos).should.equal(42)
    })

    it('returns 0 if not found', function () {
      extractRevNumber({}).should.equal(0)
    })
  })

  describe('sameFolder', () =>
    it('returns true if the folders are the same', function () {
      let a = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'foo/bar',
        creationDate: '2015-12-01T11:22:56.517Z',
        lastModification: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let b = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'FOO/BAR',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let c = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'FOO/BAR',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux', 'courge'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let d = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'FOO/BAR',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux', 'courge'],
        remote: {
          id: '123',
          rev: '8-901'
        }
      }
      let e = {
        _id: 'FOO/BAZ',
        docType: 'folder',
        path: 'FOO/BAZ',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      sameFolder(a, b).should.be.true()
      sameFolder(a, c).should.be.false()
      sameFolder(a, d).should.be.false()
      sameFolder(a, e).should.be.false()
      sameFolder(b, c).should.be.false()
      sameFolder(b, d).should.be.false()
      sameFolder(b, e).should.be.false()
      sameFolder(c, d).should.be.false()
      sameFolder(c, e).should.be.false()
      sameFolder(d, e).should.be.false()
    })
  )

  describe('sameFile', function () {
    it('returns true if the files are the same', function () {
      let a = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.517Z',
        lastModification: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let b = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'FOO/BAR',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let c = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'FOO/BAR',
        checksum: '000000047681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let d = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'FOO/BAR',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '8-901'
        }
      }
      let e = {
        _id: 'FOO/BAZ',
        docType: 'file',
        path: 'FOO/BAZ',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let f = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.517Z',
        lastModification: '2015-12-01T11:22:56.517Z',
        size: 12345,
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      sameFile(a, b).should.be.true()
      sameFile(a, c).should.be.false()
      sameFile(a, d).should.be.false()
      sameFile(a, e).should.be.false()
      sameFile(a, f).should.be.false()
      sameFile(b, c).should.be.false()
      sameFile(b, d).should.be.false()
      sameFile(b, e).should.be.false()
      sameFile(b, f).should.be.false()
      sameFile(c, d).should.be.false()
      sameFile(c, e).should.be.false()
      sameFile(c, f).should.be.false()
      sameFile(d, e).should.be.false()
      sameFile(d, f).should.be.false()
      sameFile(e, f).should.be.false()
    })

    it('does not fail when one file has executable: undefined', function () {
      let a = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.517Z',
        lastModification: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let b = clone(a)
      b.executable = undefined
      let c = clone(a)
      c.executable = false
      let d = clone(a)
      d.executable = true
      sameFile(a, b).should.be.true()
      sameFile(a, c).should.be.true()
      sameFile(a, d).should.be.false()
      sameFile(b, c).should.be.true()
      sameFile(b, d).should.be.false()
      sameFile(c, d).should.be.false()
    })
  })

  describe('sameBinary', function () {
    it('returns true for two docs with the same checksum', function () {
      let one = {
        docType: 'file',
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let two = {
        docType: 'file',
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let ret = sameBinary(one, two)
      ret.should.be.true()
    })

    it('returns true for two docs with the same remote file', function () {
      let one = {
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        docType: 'file',
        remote: {
          _id: 'f00b4r'
        }
      }
      let two = {
        docType: 'file',
        remote: {
          _id: 'f00b4r'
        }
      }
      let ret = sameBinary(one, two)
      ret.should.be.true()
      ret = sameBinary(two, one)
      ret.should.be.true()
    })

    it('returns false for two different documents', function () {
      let one = {
        docType: 'file',
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let two = {
        docType: 'file',
        checksum: '2082e7f715f058acab2398d25d135cf5f4c0ce41',
        remote: {
          _id: 'f00b4r'
        }
      }
      let three = {
        docType: 'file',
        remote: {
          _id: 'c00463'
        }
      }
      let ret = sameBinary(one, two)
      ret.should.be.false()
      ret = sameBinary(two, three)
      ret.should.be.false()
      ret = sameBinary(three, one)
      ret.should.be.false()
    })
  })

  describe('markSide', function () {
    it('marks local: 1 for a new doc', function () {
      let doc = {}
      markSide('local', doc)
      should.exist(doc.sides)
      should.exist(doc.sides.local)
      doc.sides.local.should.equal(1)
    })

    it('increments the rev for an already existing doc', function () {
      let doc = {
        sides: {
          local: 3,
          remote: 5
        }
      }
      let prev = {_rev: '5-0123'}
      markSide('local', doc, prev)
      doc.sides.local.should.equal(6)
      doc.sides.remote.should.equal(5)
    })
  })
})
