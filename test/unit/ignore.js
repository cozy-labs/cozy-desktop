/* eslint-env mocha */

const Ignore = require('../../core/ignore')
const metadata = require('../../core/metadata')

describe('Ignore', function () {
  it('rejects blank lines for patterns', function () {
    this.ignore = new Ignore(['foo', '', 'bar'])
    this.ignore.patterns.length.should.equal(2)
  })

  it('rejects comments for patterns', function () {
    this.ignore = new Ignore(['# Blah', 'foo', 'bar'])
    this.ignore.patterns.length.should.equal(2)
  })

  it('does not keep trailing spaces in patterns', function () {
    this.ignore = new Ignore(['foo  '])
    this.ignore.patterns[0].match('foo').should.be.true()
  })

  it('does not match a file when path and pattern are different', function () {
    this.ignore = new Ignore(['foo'])
    let doc = {
      _id: 'bar',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('matches a file when its path is the pattern description', function () {
    this.ignore = new Ignore(['foo'])
    let doc = {
      _id: 'foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('matches a folder when its path is the pattern description', function () {
    this.ignore = new Ignore(['foo'])
    let doc = {
      _id: 'foo',
      docType: 'folder'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('does not match a file when the pattern is for folders only', function () {
    this.ignore = new Ignore(['foo/'])
    let doc = {
      _id: 'foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('matches a folder, even with a folders only pattern', function () {
    this.ignore = new Ignore(['foo/'])
    let doc = {
      _id: 'foo',
      docType: 'folder'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('matches dotfiles', function () {
    this.ignore = new Ignore(['.foo'])
    let doc = {
      _id: '.foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts glob', function () {
    this.ignore = new Ignore(['*.txt'])
    let doc = {
      _id: 'foo.txt',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts wild card', function () {
    this.ignore = new Ignore(['fo?'])
    let doc = {
      _id: 'foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts wild card (bis)', function () {
    let doc = {
      _id: 'foobar',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('accepts braces', function () {
    this.ignore = new Ignore(['foo.{md,txt}'])
    let doc = {
      _id: 'foo.txt',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts brackets', function () {
    this.ignore = new Ignore(['[a-f]oo'])
    let doc = {
      _id: 'foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('ignores files only on basename', function () {
    this.ignore = new Ignore(['foo'])
    let doc = {
      _id: 'abc/foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('ignores files only on basename (bis)', function () {
    this.ignore = new Ignore(['/foo'])
    let doc = {
      _id: 'abc/foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('ignores files in a ignored directory', function () {
    this.ignore = new Ignore(['foo'])
    let doc = {
      _id: 'foo/bar',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('ignores files in a ignored directory (bis)', function () {
    this.ignore = new Ignore(['foo/'])
    let doc = {
      _id: 'foo/bar',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('ignores directories in a ignored directory', function () {
    this.ignore = new Ignore(['foo'])
    let doc = {
      _id: 'foo/baz',
      docType: 'folder'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('restricts ignore rules with a leading slash to a full path', function () {
    this.ignore = new Ignore(['/foo'])
    let doc = {
      _id: 'foo',
      docType: 'folder'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('restricts ignore rules with a leading slash to a full path (bis)', function () {
    this.ignore = new Ignore(['/foo'])
    let doc = {
      _id: 'bar/foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('accepts two asterisks at the start', function () {
    this.ignore = new Ignore(['**/foo'])
    let doc = {
      _id: 'abc/def/foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts two asterisks at the end', function () {
    this.ignore = new Ignore(['foo/**'])
    let doc = {
      _id: 'foo/abc/def',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts two asterisks at the middle', function () {
    this.ignore = new Ignore(['a/**/b'])
    let doc = {
      _id: 'a/foo/bar/b',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts two asterisks at the middle (bis)', function () {
    this.ignore = new Ignore(['a/**/b'])
    let doc = {
      _id: 'a/b',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts two asterisks at the middle (ter)', function () {
    this.ignore = new Ignore(['a/**/b'])
    let doc = {
      _id: 'foo/a/b',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('accepts escaping char', function () {
    this.ignore = new Ignore(['\\#foo'])
    let doc = {
      _id: '#foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('accepts escaping char', function () {
    this.ignore = new Ignore(['\\!foo'])
    let doc = {
      _id: '!foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('can negate a previous rule', function () {
    this.ignore = new Ignore(['*.foo', '!important.foo'])
    let doc = {
      _id: 'important.foo',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('can negate a previous rule (bis)', function () {
    this.ignore = new Ignore(['/*', '!/foo', '/foo/*', '!/foo/bar'])
    let doc = {
      _id: 'foo/bar/abc/def',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('can negate a previous rule (ter)', function () {
    this.ignore = new Ignore(['/*', '!/foo', '/foo/*', '!/foo/bar'])
    let doc = {
      _id: 'a/foo/bar',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('can negate a previous rule (quater)', function () {
    this.ignore = new Ignore(['bar*', '!/foo/bar*'])
    let doc = {
      _id: 'foo/bar',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.false()
  })

  it('has some defaults rules for dropbox', function () {
    this.ignore = new Ignore([])
    this.ignore.addDefaultRules()
    let doc = {
      _id: '.dropbox',
      docType: 'folder'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('has some defaults rules for editors', function () {
    this.ignore = new Ignore([])
    this.ignore.addDefaultRules()
    let doc = {
      _id: 'foo.c.swp~',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('has some defaults rules for OSes', function () {
    this.ignore = new Ignore([])
    this.ignore.addDefaultRules()
    let doc = {
      _id: 'Thumbs.db',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('does ignore Icon\\r', function () {
    this.ignore = new Ignore([])
    this.ignore.addDefaultRules()
    let doc = {
      _id: 'path/to/Icon\r',
      docType: 'file'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('does ignore any hidden file or directory', function () {
    this.ignore = new Ignore([])
    this.ignore.addDefaultRules()
    let doc = {
      _id: '.eclipse',
      docType: 'folder'
    }
    this.ignore.isIgnored(doc).should.be.true()
  })

  it('ignores Microsoft Office temporary files', function () {
    this.ignore = new Ignore([])
    this.ignore.addDefaultRules()
    this.ignore.isIgnored({_id: metadata.id('~$whatever.docx'), docType: 'file'}).should.be.true()
    this.ignore.isIgnored({_id: metadata.id('~$whatever.xlsx'), docType: 'file'}).should.be.true()
    this.ignore.isIgnored({_id: metadata.id('~$whatever.pptx'), docType: 'file'}).should.be.true()
  })
})
