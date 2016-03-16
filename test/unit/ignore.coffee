should = require 'should'

Ignore = require '../../src/ignore'


describe 'Ignore', ->

    describe 'Loading patterns', ->

        it 'rejects blank lines for patterns', ->
            @ignore = new Ignore ['foo', '', 'bar']
            descriptions = @ignore.patterns.map (p) -> p.description
            descriptions.should.eql ['foo', 'bar']

        it 'rejects comments for patterns', ->
            @ignore = new Ignore ['# Blah', 'foo', 'bar']
            descriptions = @ignore.patterns.map (p) -> p.description
            descriptions.should.eql ['foo', 'bar']

        it 'does not keep trailing spaces in patterns', ->
            @ignore = new Ignore ['foo  ']
            @ignore.patterns[0].description.should.equal 'foo'

        it 'detects trailing slash', ->
            @ignore = new Ignore ['foo/', 'bar']
            @ignore.patterns[0].description.should.equal 'foo'
            @ignore.patterns[0].folder.should.be.true()
            @ignore.patterns[1].folder.should.be.false()


    describe 'Matching a pattern', ->
        before -> @ignore = new Ignore []

        it 'does not match a file when path and description are different', ->
            pattern =
                description: 'foo'
                folder: false
            @ignore.match(pattern, 'bar', 'folder').should.be.false()

        it 'matches a file when its path is the pattern description', ->
            pattern =
                description: 'foo'
                folder: false
            @ignore.match(pattern, 'foo', 'file').should.be.true()

        it 'matches a folder when its path is the pattern description', ->
            pattern =
                description: 'foo'
                folder: false
            @ignore.match(pattern, 'foo', 'folder').should.be.true()

        it 'does not match a file when the pattern is for folders only', ->
            pattern =
                description: 'foo'
                folder: true
            @ignore.match(pattern, 'foo', 'file').should.be.false()

        it 'matches a folder, even with a folders only pattern', ->
            pattern =
                description: 'foo'
                folder: true
            @ignore.match(pattern, 'foo', 'folder').should.be.true()


    describe 'Determining if a file/folder is ignored', ->

        it 'does not ignore paths when no pattern match', ->
            @ignore = new Ignore ['foo']
            @ignore.isIgnored('bar', 'file').should.be.false()
            @ignore.isIgnored('bar', 'folder').should.be.false()

        it 'ignores a path that is completely matched', ->
            @ignore = new Ignore ['foo/bar']
            @ignore.isIgnored('foo/bar', 'file').should.be.true()
            @ignore.isIgnored('foo/bar', 'folder').should.be.true()

        it 'ignores only folders when the pattern ends with a /', ->
            @ignore = new Ignore ['foo/']
            @ignore.isIgnored('foo', 'file').should.be.false()
            @ignore.isIgnored('foo', 'folder').should.be.true()
