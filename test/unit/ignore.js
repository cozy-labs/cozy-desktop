/* eslint-env mocha */

const fs = require('fs')
const should = require('should')
const sinon = require('sinon')

const Ignore = require('../../core/ignore')
const metadata = require('../../core/metadata')

describe('Ignore', function () {
  describe('Removal of unnecessary lines', () => {
    it('remove blank lines or comments', function () {
      const ignore = new Ignore([
        'foo',
        '', // removed
        'bar',
        '# foo', // removed
        '\\#bar'
      ])
      ignore.patterns.length.should.equal(3)
    })
  })

  describe('Ignored patterns', () => {
    it("don't ignore file name not matching to the pattern", function () {
      const ignore = new Ignore(['foo'])
      const doc = {
        _id: 'bar',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.false()
    })

    it('ignore file name matching to the pattern', function () {
      const ignore = new Ignore(['foo'])
      const doc = {
        _id: 'foo',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('ignore folder name matching to the pattern', function () {
      const ignore = new Ignore(['foo'])
      const doc = {
        _id: 'foo',
        docType: 'folder'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it("don't ignore file name when the pattern match folders", function () {
      const ignore = new Ignore(['foo/'])
      const file = {
        _id: 'foo',
        docType: 'file'
      }
      const folder = {
        _id: 'foo',
        docType: 'folder'
      }
      ignore.isIgnored(file).should.be.false()
      ignore.isIgnored(folder).should.be.true()
    })
  })

  describe('Patterns operators', () => {
    it('match to the glob with *', function () {
      const ignore = new Ignore(['*.txt'])
      const doc = {
        _id: 'foo.txt',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('match to the glob with ?', function () {
      const ignore = new Ignore(['ba?'])
      const bar = {
        _id: 'bar',
        docType: 'file'
      }
      const baz = {
        _id: 'baz',
        docType: 'file'
      }
      const foo = {
        _id: 'foo',
        docType: 'file'
      }
      const barbaz = {
        _id: 'barbaz',
        docType: 'file'
      }
      ignore.isIgnored(bar).should.be.true()
      ignore.isIgnored(baz).should.be.true()
      ignore.isIgnored(foo).should.be.false()
      ignore.isIgnored(barbaz).should.be.false()
    })

    it('match braces {p1,p2}', function () {
      const ignore = new Ignore(['{bar,baz}.txt'])
      const foo = {
        _id: 'foo.txt',
        docType: 'file'
      }
      const bar = {
        _id: 'bar.txt',
        docType: 'file'
      }
      const baz = {
        _id: 'baz.txt',
        docType: 'file'
      }
      ignore.isIgnored(bar).should.be.true()
      ignore.isIgnored(baz).should.be.true()
      ignore.isIgnored(foo).should.be.false()
    })

    it('match to the glob with range [a-c]', function () {
      const ignore = new Ignore(['foo[a-c]'])
      const fooa = {
        _id: 'fooa',
        docType: 'file'
      }
      const foob = {
        _id: 'foob',
        docType: 'file'
      }
      const fooc = {
        _id: 'fooc',
        docType: 'file'
      }
      const food = {
        _id: 'food',
        docType: 'file'
      }
      ignore.isIgnored(fooa).should.be.true()
      ignore.isIgnored(foob).should.be.true()
      ignore.isIgnored(fooc).should.be.true()
      ignore.isIgnored(food).should.be.false()
    })
  })

  describe('Path patterns', () => {
    it('ignore files in subdirectory', function () {
      const doc = {
        _id: 'bar/foo',
        docType: 'file'
      }
      new Ignore(['foo']).isIgnored(doc).should.be.true()
      new Ignore(['/foo']).isIgnored(doc).should.be.false()
    })

    it('ignore files in a ignored directory', function () {
      const doc = {
        _id: 'foo/bar',
        docType: 'file'
      }
      new Ignore(['foo']).isIgnored(doc).should.be.true()
      new Ignore(['foo/']).isIgnored(doc).should.be.true()
    })

    it('ignore folders in a ignored directory', function () {
      const ignore = new Ignore(['foo'])
      const doc = {
        _id: 'foo/bar',
        docType: 'folder'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('match leading slash pattern', function () {
      const ignore = new Ignore(['/foo'])
      const file = {
        _id: 'foo',
        docType: 'folder'
      }
      const subfile = {
        _id: 'bar/foo',
        docType: 'file'
      }
      ignore.isIgnored(file).should.be.true()
      ignore.isIgnored(subfile).should.be.false()
    })

    it('match nested file with leading **', function () {
      const ignore = new Ignore(['**/baz'])
      const doc = {
        _id: 'foo/bar/baz',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('match nested files with trailing **', function () {
      const ignore = new Ignore(['foo/**'])
      const doc = {
        _id: 'foo/bar/baz',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('match nested files with middle **', function () {
      const ignore = new Ignore(['a/**/b'])
      const nestedFile = {
        _id: 'a/foo/bar/b',
        docType: 'file'
      }
      const unnestedFile = {
        _id: 'a/b',
        docType: 'file'
      }
      ignore.isIgnored(nestedFile).should.be.true()
      ignore.isIgnored(unnestedFile).should.be.true()
    })

    it("doen't match misnested file with middle **", function () {
      const ignore = new Ignore(['a/**/b'])
      const doc = {
        _id: 'foo/a/b',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.false()
    })
  })

  describe('Escaping', () => {
    it('escapes the comment character', function () {
      const ignore = new Ignore(['\\#foo'])
      const doc = {
        _id: '#foo',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('escapes the negation character', function () {
      const ignore = new Ignore(['\\!foo'])
      const doc = {
        _id: '!foo',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })
  })

  describe('Negate rules', () => {
    it('can negate a rule', () => {
      const ignore = new Ignore(['!foo'])
      const foo = {
        _id: 'foo',
        docType: 'file'
      }
      ignore.isIgnored(foo).should.be.false()
    })

    it('can negate a previous rule', function () {
      const ignore = new Ignore(['*.foo', '!bar.foo'])
      const bar = {
        _id: 'bar.foo',
        docType: 'file'
      }
      const baz = {
        _id: 'baz.foo',
        docType: 'file'
      }
      ignore.isIgnored(bar).should.be.false()
      ignore.isIgnored(baz).should.be.true()
    })

    it('can negate a more complex previous rules organization', function () {
      const ignore = new Ignore(['/*', '!/foo', '/foo/*', '!/foo/bar'])
      const foobar = {
        _id: 'foo/bar',
        docType: 'file'
      }
      const foobaz = {
        _id: 'foo/baz',
        docType: 'file'
      }
      const bazbar = {
        _id: 'baz/bar',
        docType: 'file'
      }
      ignore.isIgnored(foobar).should.be.false()
      ignore.isIgnored(foobaz).should.be.true()
      ignore.isIgnored(bazbar).should.be.true()
    })
  })

  describe('Default rules', () => {
    it('has some defaults rules for dropbox', function () {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      const doc = {
        _id: '.dropbox',
        docType: 'folder'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('has some defaults rules for editors', function () {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      const doc = {
        _id: 'foo.c.swp~',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('has some defaults rules for OSes', function () {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      const doc = {
        _id: 'Thumbs.db',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('does ignore Icon', function () {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      const doc = {
        _id: 'path/to/Icon',
        docType: 'file'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('does ignore any hidden file or directory', function () {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      const doc = {
        _id: '.eclipse',
        docType: 'folder'
      }
      ignore.isIgnored(doc).should.be.true()
    })

    it('ignores Microsoft Office temporary files', function () {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({ _id: metadata.id('~$whatever.docx'), docType: 'file' })
        .should.be.true()
      ignore
        .isIgnored({ _id: metadata.id('~$whatever.xlsx'), docType: 'file' })
        .should.be.true()
      ignore
        .isIgnored({ _id: metadata.id('~$whatever.pptx'), docType: 'file' })
        .should.be.true()
    })

    it('ignores hidden folder $Recycle.bin', () => {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({
          _id: '$Recycle.bin/foo',
          type: 'file'
        })
        .should.be.true()
      ignore
        .isIgnored({
          _id: '$Recycle.bin',
          type: 'folder'
        })
        .should.be.true()
    })

    it('can be loaded from file with CRLF', () => {
      const ignore = new Ignore([])
      const readFileSync = sinon.stub(fs, 'readFileSync')
      try {
        readFileSync.returns('foo\r\nbar\r\n\r\n')
        should(() => ignore.addDefaultRules()).not.throwError()
        should(ignore.isIgnored({_id: 'foo'})).be.true()
        should(ignore.isIgnored({_id: 'bar'})).be.true()
      } finally {
        readFileSync.restore()
      }
    })
  })

  describe('OS specific rules', () => {
    before(() => {
      this.originalPlatform = Object.getOwnPropertyDescriptor(
        process,
        'platform'
      )
    })

    after(() => {
      Object.defineProperty(process, 'platform', this.originalPlatform)
    })
    it('does not match files if case does not match', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      })
      const ignore = new Ignore(['Foo'])
      ignore
        .isIgnored({
          _id: 'foo',
          type: 'file'
        })
        .should.be.false()
    })

    it('match files even if case does not match on darwin', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      })
      const ignore = new Ignore(['Foo'])
      ignore
        .isIgnored({
          _id: 'foo',
          type: 'file'
        })
        .should.be.true()
    })

    it('match files even if case does not match on darwin', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      })
      const ignore = new Ignore(['Foo'])
      ignore
        .isIgnored({
          _id: 'foo',
          type: 'file'
        })
        .should.be.true()
    })
  })
})
