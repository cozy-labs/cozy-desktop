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
        @ignore.isIgnored('bar', 'file').should.be.false()

    it 'matches a file when its path is the pattern description', ->
        @ignore = new Ignore ['foo']
        @ignore.isIgnored('foo', 'file').should.be.true()

    it 'matches a folder when its path is the pattern description', ->
        @ignore = new Ignore ['foo']
        @ignore.isIgnored('foo', 'folder').should.be.true()

    it 'does not match a file when the pattern is for folders only', ->
        @ignore = new Ignore ['foo/']
        @ignore.isIgnored('foo', 'file').should.be.false()

    it 'matches a folder, even with a folders only pattern', ->
        @ignore = new Ignore ['foo/']
        @ignore.isIgnored('foo', 'folder').should.be.true()

    it 'matches dotfiles', ->
        @ignore = new Ignore ['.foo']
        @ignore.isIgnored('.foo', 'file').should.be.true()

    it 'accepts glob', ->
        @ignore = new Ignore ['*.txt']
        @ignore.isIgnored('foo.txt', 'file').should.be.true()

    it 'accepts braces', ->
        @ignore = new Ignore ['foo.{md,txt}']
        @ignore.isIgnored('foo.txt', 'file').should.be.true()

    it 'accepts brackets', ->
        @ignore = new Ignore ['[a-f]oo']
        @ignore.isIgnored('foo', 'file').should.be.true()
