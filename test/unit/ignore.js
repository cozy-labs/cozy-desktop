/* eslint-env mocha */

const fs = require('fs')
const path = require('path')

const should = require('should')
const sinon = require('sinon')

const { Ignore, loadSync } = require('../../core/ignore')
const metadata = require('../../core/metadata')
const TmpDir = require('../support/helpers/TmpDir')
const { onPlatform } = require('../support/helpers/platform')

describe('Ignore', function() {
  describe('.loadSync()', () => {
    let tmpDir

    beforeEach(async () => {
      tmpDir = await TmpDir.emptyForTestFile(__filename)
    })

    const userIgnoreRules = () => path.join(tmpDir, 'user-ignore-rules')

    it('loads user-defined ignore rules', () => {
      fs.writeFileSync(userIgnoreRules(), 'foo\r\nbar\r\n\r\n')
      const ignore = loadSync(userIgnoreRules())
      should(
        ignore.isIgnored({ relativePath: 'foo', isFolder: false })
      ).be.true()
      should(
        ignore.isIgnored({ relativePath: 'bar', isFolder: false })
      ).be.true()
    })
  })

  describe('Removal of unnecessary lines', () => {
    it('remove blank lines or comments', function() {
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
    it("don't ignore file name not matching to the pattern", function() {
      const ignore = new Ignore(['foo'])
      ignore
        .isIgnored({ relativePath: 'bar', isFolder: false })
        .should.be.false()
    })

    it('ignore file name matching to the pattern', function() {
      const ignore = new Ignore(['foo'])
      ignore
        .isIgnored({ relativePath: 'foo', isFolder: false })
        .should.be.true()
    })

    it('ignore folder name matching to the pattern', function() {
      const ignore = new Ignore(['foo'])
      ignore.isIgnored({ relativePath: 'foo', isFolder: true }).should.be.true()
    })

    it("don't ignore file name when the pattern match folders", function() {
      const ignore = new Ignore(['foo/'])
      ignore
        .isIgnored({ relativePath: 'foo', isFolder: false })
        .should.be.false()
      ignore.isIgnored({ relativePath: 'foo', isFolder: true }).should.be.true()
    })
  })

  describe('Patterns operators', () => {
    it('match to the glob with *', function() {
      const ignore = new Ignore(['*.txt'])
      ignore
        .isIgnored({ relativePath: 'foo.txt', isFolder: false })
        .should.be.true()
    })

    it('match to the glob with ?', function() {
      const ignore = new Ignore(['ba?'])
      ignore
        .isIgnored({ relativePath: 'bar', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'baz', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'foo', isFolder: false })
        .should.be.false()
      ignore
        .isIgnored({ relativePath: 'barbaz', isFolder: false })
        .should.be.false()
    })

    it('match braces {p1,p2}', function() {
      const ignore = new Ignore(['{bar,baz}.txt'])
      ignore
        .isIgnored({ relativePath: 'bar.txt', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'baz.txt', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'foo.txt', isFolder: false })
        .should.be.false()
    })

    it('match to the glob with range [a-c]', function() {
      const ignore = new Ignore(['foo[a-c]'])
      ignore
        .isIgnored({ relativePath: 'fooa', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'foob', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'fooc', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'food', isFolder: false })
        .should.be.false()
    })
  })

  describe('Path patterns', () => {
    it('ignore files in subdirectory', function() {
      new Ignore(['foo'])
        .isIgnored({ relativePath: 'bar/foo', isFolder: false })
        .should.be.true()
      new Ignore(['/foo'])
        .isIgnored({ relativePath: 'bar/foo', isFolder: false })
        .should.be.false()
    })

    it('ignore files in a ignored directory', function() {
      new Ignore(['foo'])
        .isIgnored({ relativePath: 'foo/bar', isFolder: false })
        .should.be.true()
      new Ignore(['foo/'])
        .isIgnored({ relativePath: 'foo/bar', isFolder: false })
        .should.be.true()
    })

    it('ignore folders in a ignored directory', function() {
      const ignore = new Ignore(['foo'])
      ignore
        .isIgnored({ relativePath: 'foo/bar', isFolder: true })
        .should.be.true()
    })

    it('match leading slash pattern', function() {
      const ignore = new Ignore(['/foo'])
      ignore.isIgnored({ relativePath: 'foo', isFolder: true }).should.be.true()
      ignore
        .isIgnored({ relativePath: 'bar/foo', isFolder: false })
        .should.be.false()
    })

    it('match nested file with leading **', function() {
      const ignore = new Ignore(['**/baz'])
      ignore
        .isIgnored({ relativePath: 'foo/bar/baz', isFolder: false })
        .should.be.true()
    })

    it('match nested files with trailing **', function() {
      const ignore = new Ignore(['foo/**'])
      ignore
        .isIgnored({ relativePath: 'foo/bar/baz', isFolder: false })
        .should.be.true()
    })

    it('match nested files with middle **', function() {
      const ignore = new Ignore(['a/**/b'])
      ignore
        .isIgnored({ relativePath: 'a/foo/bar/b', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'a/b', isFolder: false })
        .should.be.true()
    })

    it("doen't match misnested file with middle **", function() {
      const ignore = new Ignore(['a/**/b'])
      ignore
        .isIgnored({ relativePath: 'foo/a/b', isFolder: false })
        .should.be.false()
    })
  })

  describe('Escaping', () => {
    it('escapes the comment character', function() {
      const ignore = new Ignore(['\\#foo'])
      ignore
        .isIgnored({ relativePath: '#foo', isFolder: false })
        .should.be.true()
    })

    it('escapes the negation character', function() {
      const ignore = new Ignore(['\\!foo'])
      ignore
        .isIgnored({ relativePath: '!foo', isFolder: false })
        .should.be.true()
    })
  })

  describe('Negate rules', () => {
    it('can negate a rule', () => {
      const ignore = new Ignore(['!foo'])
      ignore
        .isIgnored({ relativePath: 'foo', isFolder: false })
        .should.be.false()
    })

    it('can negate a previous rule', function() {
      const ignore = new Ignore(['*.foo', '!bar.foo'])
      ignore
        .isIgnored({ relativePath: 'bar.foo', isFolder: false })
        .should.be.false()
      ignore
        .isIgnored({ relativePath: 'baz.foo', isFolder: false })
        .should.be.true()
    })

    it('can negate a more complex previous rules organization', function() {
      const ignore = new Ignore(['/*', '!/foo', '/foo/*', '!/foo/bar'])
      ignore
        .isIgnored({ relativePath: 'foo/bar', isFolder: false })
        .should.be.false()
      ignore
        .isIgnored({ relativePath: 'foo/baz', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: 'baz/bar', isFolder: false })
        .should.be.true()
    })
  })

  describe('Default rules', () => {
    it('has some defaults rules for dropbox', function() {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({ relativePath: '.dropbox', isFolder: true })
        .should.be.true()
    })

    it('has some defaults rules for editors', function() {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({ relativePath: 'foo.c.swp~', isFolder: false })
        .should.be.true()
    })

    it('has some defaults rules for OSes', function() {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({ relativePath: 'Thumbs.db', isFolder: false })
        .should.be.true()
    })

    it('does ignore Icon', function() {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({ relativePath: 'path/to/Icon', isFolder: false })
        .should.be.true()
    })

    it('does ignore any hidden file or directory', function() {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({ relativePath: '.eclipse', isFolder: true })
        .should.be.true()
    })

    it('ignores Microsoft Office temporary files', function() {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({
          relativePath: metadata.id('~$whatever.docx'),
          isFolder: false
        })
        .should.be.true()
      ignore
        .isIgnored({
          relativePath: metadata.id('~$whatever.xlsx'),
          isFolder: false
        })
        .should.be.true()
      ignore
        .isIgnored({
          relativePath: metadata.id('~$whatever.pptx'),
          isFolder: false
        })
        .should.be.true()
      ignore
        .isIgnored({
          relativePath: metadata.id('~$whatever.ods'),
          isFolder: false
        })
        .should.be.true()
    })

    it('ignores hidden folder $Recycle.bin', () => {
      const ignore = new Ignore([])
      ignore.addDefaultRules()
      ignore
        .isIgnored({ relativePath: '$Recycle.bin/foo', isFolder: false })
        .should.be.true()
      ignore
        .isIgnored({ relativePath: '$Recycle.bin', isFolder: true })
        .should.be.true()
    })

    it('can be loaded from file with CRLF', () => {
      const ignore = new Ignore([])
      const readFileSync = sinon.stub(fs, 'readFileSync')
      try {
        readFileSync.returns('foo\r\nbar\r\n\r\n')
        should(() => ignore.addDefaultRules()).not.throwError()
        should(
          ignore.isIgnored({ relativePath: 'foo', isFolder: false })
        ).be.true()
        should(
          ignore.isIgnored({ relativePath: 'bar', isFolder: false })
        ).be.true()
      } finally {
        readFileSync.restore()
      }
    })
  })

  describe('OS specific rules', () => {
    onPlatform('linux', () => {
      it('does not match files if case does not match', () => {
        const ignore = new Ignore(['Foo'])
        ignore
          .isIgnored({ relativePath: 'foo', isFolder: false })
          .should.be.false()
      })
    })

    onPlatform('darwin', () => {
      it('match files even if case does not match on darwin', () => {
        const ignore = new Ignore(['Foo'])
        ignore
          .isIgnored({ relativePath: 'foo', isFolder: false })
          .should.be.true()
      })
    })

    onPlatform('win32', () => {
      it('match files even if case does not match on darwin', () => {
        const ignore = new Ignore(['Foo'])
        ignore
          .isIgnored({ relativePath: 'foo', isFolder: false })
          .should.be.true()
      })
    })
  })

  describe('#isIgnored()', () => {
    onPlatform('win32', () => {
      context('when at least one rule to match against', () => {
        const ignore = new Ignore(['at least one rule'])

        for (const relativePath of [
          'c:',
          'd:whatever',
          'e:\\whatever',
          'f:what\\ever'
        ]) {
          context(`with relative path ${JSON.stringify(relativePath)}`, () => {
            it('does not confuse the path start with a Windows drive letter', () => {
              ignore.isIgnored({ relativePath }).should.be.false()
            })
          })
        }
      })
    })
  })
})
