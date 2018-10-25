/* eslint-env mocha */

const Ignore = require('../../core/ignore')
const metadata = require('../../core/metadata')

describe('Ignore', function () {
  it('rejects blank lines for patterns', function () {
    const ignore = new Ignore(['foo', '', 'bar'])
    ignore.patterns.length.should.equal(2)
  })

  it('rejects comments for patterns', function () {
    const ignore = new Ignore(['# Blah', 'foo', 'bar'])
    ignore.patterns.length.should.equal(2)
  })

  it('does not keep trailing spaces in patterns', function () {
    const ignore = new Ignore(['foo  '])
    ignore.patterns[0].match('foo').should.be.true()
  })

  it('does not match a file when path and pattern are different', function () {
    const ignore = new Ignore(['foo'])
    const doc = {
      _id: 'bar',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

  it('matches a file when its path is the pattern description', function () {
    const ignore = new Ignore(['foo'])
    const doc = {
      _id: 'foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('matches a folder when its path is the pattern description', function () {
    const ignore = new Ignore(['foo'])
    const doc = {
      _id: 'foo',
      docType: 'folder'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('does not match a file when the pattern is for folders only', function () {
    const ignore = new Ignore(['foo/'])
    const doc = {
      _id: 'foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

  it('matches a folder, even with a folders only pattern', function () {
    const ignore = new Ignore(['foo/'])
    const doc = {
      _id: 'foo',
      docType: 'folder'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('matches dotfiles', function () {
    const ignore = new Ignore(['.foo'])
    const doc = {
      _id: '.foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts glob', function () {
    const ignore = new Ignore(['*.txt'])
    const doc = {
      _id: 'foo.txt',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts wild card', function () {
    const ignore = new Ignore(['fo?'])
    const doc = {
      _id: 'foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts wild card (bis)', function () {
    const ignore = new Ignore(['fo?'])
    const doc = {
      _id: 'foobar',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

  it('accepts braces', function () {
    const ignore = new Ignore(['foo.{md,txt}'])
    const doc = {
      _id: 'foo.txt',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts brackets', function () {
    const ignore = new Ignore(['[a-f]oo'])
    const doc = {
      _id: 'foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('ignores files only on basename', function () {
    const ignore = new Ignore(['foo'])
    const doc = {
      _id: 'abc/foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('ignores files only on basename (bis)', function () {
    const ignore = new Ignore(['/foo'])
    const doc = {
      _id: 'abc/foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

  it('ignores files in a ignored directory', function () {
    const ignore = new Ignore(['foo'])
    const doc = {
      _id: 'foo/bar',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('ignores files in a ignored directory (bis)', function () {
    const ignore = new Ignore(['foo/'])
    const doc = {
      _id: 'foo/bar',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('ignores directories in a ignored directory', function () {
    const ignore = new Ignore(['foo'])
    const doc = {
      _id: 'foo/baz',
      docType: 'folder'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('restricts ignore rules with a leading slash to a full path', function () {
    const ignore = new Ignore(['/foo'])
    const doc = {
      _id: 'foo',
      docType: 'folder'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('restricts ignore rules with a leading slash to a full path (bis)', function () {
    const ignore = new Ignore(['/foo'])
    const doc = {
      _id: 'bar/foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

  it('accepts two asterisks at the start', function () {
    const ignore = new Ignore(['**/foo'])
    const doc = {
      _id: 'abc/def/foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts two asterisks at the end', function () {
    const ignore = new Ignore(['foo/**'])
    const doc = {
      _id: 'foo/abc/def',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts two asterisks at the middle', function () {
    const ignore = new Ignore(['a/**/b'])
    const doc = {
      _id: 'a/foo/bar/b',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts two asterisks at the middle (bis)', function () {
    const ignore = new Ignore(['a/**/b'])
    const doc = {
      _id: 'a/b',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts two asterisks at the middle (ter)', function () {
    const ignore = new Ignore(['a/**/b'])
    const doc = {
      _id: 'foo/a/b',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

  it('accepts escaping char', function () {
    const ignore = new Ignore(['\\#foo'])
    const doc = {
      _id: '#foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('accepts escaping char', function () {
    const ignore = new Ignore(['\\!foo'])
    const doc = {
      _id: '!foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('can negate a previous rule', function () {
    const ignore = new Ignore(['*.foo', '!important.foo'])
    const doc = {
      _id: 'important.foo',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

  it('can negate a previous rule (bis)', function () {
    const ignore = new Ignore(['/*', '!/foo', '/foo/*', '!/foo/bar'])
    const doc = {
      _id: 'foo/bar/abc/def',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

  it('can negate a previous rule (ter)', function () {
    const ignore = new Ignore(['/*', '!/foo', '/foo/*', '!/foo/bar'])
    const doc = {
      _id: 'a/foo/bar',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.true()
  })

  it('can negate a previous rule (quater)', function () {
    const ignore = new Ignore(['bar*', '!/foo/bar*'])
    const doc = {
      _id: 'foo/bar',
      docType: 'file'
    }
    ignore.isIgnored(doc).should.be.false()
  })

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

  it('does ignore Icon\\r', function () {
    const ignore = new Ignore([])
    ignore.addDefaultRules()
    const doc = {
      _id: 'path/to/Icon\r',
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
})
