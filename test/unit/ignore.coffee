should = require 'should'

Ignore = require '../../src/ignore'


describe 'Ignore', ->

    it 'rejects blank lines for patterns', ->
        @ignore = new Ignore ['foo', '', 'bar']
        @ignore.patterns.length.should.equal 2

    it 'rejects comments for patterns', ->
        @ignore = new Ignore ['# Blah', 'foo', 'bar']
        @ignore.patterns.length.should.equal 2

    it 'does not keep trailing spaces in patterns', ->
        @ignore = new Ignore ['foo  ']
        @ignore.patterns[0].match('foo').should.be.true()

    it 'does not match a file when path and pattern are different', ->
        @ignore = new Ignore ['foo']
        doc =
            _id: 'bar'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.false()

    it 'matches a file when its path is the pattern description', ->
        @ignore = new Ignore ['foo']
        doc =
            _id: 'foo'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'matches a folder when its path is the pattern description', ->
        @ignore = new Ignore ['foo']
        doc =
            _id: 'foo'
            docType: 'folder'
        @ignore.isIgnored(doc).should.be.true()

    it 'does not match a file when the pattern is for folders only', ->
        @ignore = new Ignore ['foo/']
        doc =
            _id: 'foo'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.false()

    it 'matches a folder, even with a folders only pattern', ->
        @ignore = new Ignore ['foo/']
        doc =
            _id: 'foo'
            docType: 'folder'
        @ignore.isIgnored(doc).should.be.true()

    it 'matches dotfiles', ->
        @ignore = new Ignore ['.foo']
        doc =
            _id: '.foo'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'accepts glob', ->
        @ignore = new Ignore ['*.txt']
        doc =
            _id: 'foo.txt'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'accepts wild card', ->
        @ignore = new Ignore ['fo?']
        doc =
            _id: 'foo'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'accepts wild card (bis)', ->
        doc =
            _id: 'foobar'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.false()

    it 'accepts braces', ->
        @ignore = new Ignore ['foo.{md,txt}']
        doc =
            _id: 'foo.txt'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'accepts brackets', ->
        @ignore = new Ignore ['[a-f]oo']
        doc =
            _id: 'foo'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'ignores files only on basename', ->
        @ignore = new Ignore ['foo']
        doc =
            _id: 'abc/foo'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'ignores files only on basename (bis)', ->
        @ignore = new Ignore ['/foo']
        doc =
            _id: 'abc/foo'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.false()

    it 'ignores files in a ignored directory', ->
        @ignore = new Ignore ['foo']
        doc =
            _id: 'foo/bar'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'ignores files in a ignored directory (bis)', ->
        @ignore = new Ignore ['foo/']
        doc =
            _id: 'foo/bar'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.true()

    it 'ignores directories in a ignored directory', ->
        @ignore = new Ignore ['foo']
        doc =
            _id: 'foo/baz'
            docType: 'folder'
        @ignore.isIgnored(doc).should.be.true()

    it 'restricts ignore rules with a leading slash to a full path', ->
        @ignore = new Ignore ['/foo']
        doc =
            _id: 'foo'
            docType: 'folder'
        @ignore.isIgnored(doc).should.be.true()

    it 'restricts ignore rules with a leading slash to a full path (bis)', ->
        @ignore = new Ignore ['/foo']
        doc =
            _id: 'bar/foo'
            docType: 'file'
        @ignore.isIgnored(doc).should.be.false()
