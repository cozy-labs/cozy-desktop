import should from 'should';

import App from '../../src/app';


describe('App', () =>

    describe('parseCozyUrl', function() {
        it('parses https://example.com/', function() {
            let parsed = App.prototype.parseCozyUrl('https://example.com');
            parsed.protocol.should.equal('https:');
            return parsed.host.should.equal('example.com');
        });

        it('parses example.org as https://example.org', function() {
            let parsed = App.prototype.parseCozyUrl('example.org');
            parsed.protocol.should.equal('https:');
            return parsed.host.should.equal('example.org');
        });

        it('parses zoe as https://zoe.cozycloud.cc', function() {
            let parsed = App.prototype.parseCozyUrl('zoe');
            parsed.protocol.should.equal('https:');
            return parsed.host.should.equal('zoe.cozycloud.cc');
        });

        it('parses http://localhost:9104', function() {
            let parsed = App.prototype.parseCozyUrl('http://localhost:9104');
            parsed.protocol.should.equal('http:');
            parsed.hostname.should.equal('localhost');
            return parsed.port.should.equal('9104');
        });
    })
);
