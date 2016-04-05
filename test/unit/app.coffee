should = require 'should'

App = require '../../src/app'


describe 'App', ->

    describe 'parseCozyUrl', ->
        it 'parses https://example.com/', ->
            parsed = App::parseCozyUrl 'https://example.com'
            parsed.protocol.should.equal 'https:'
            parsed.host.should.equal 'example.com'

        it 'parses example.org as https://example.org', ->
            parsed = App::parseCozyUrl 'example.org'
            parsed.protocol.should.equal 'https:'
            parsed.host.should.equal 'example.org'

        it 'parses zoe as https://zoe.cozycloud.cc', ->
            parsed = App::parseCozyUrl 'zoe'
            parsed.protocol.should.equal 'https:'
            parsed.host.should.equal 'zoe.cozycloud.cc'

        it 'parses http://localhost:9104', ->
            parsed = App::parseCozyUrl 'http://localhost:9104'
            parsed.protocol.should.equal 'http:'
            parsed.hostname.should.equal 'localhost'
            parsed.port.should.equal '9104'
