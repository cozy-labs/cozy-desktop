/* eslint-env mocha */

import sinon from 'sinon'

import App from '../../src/app'

describe('App', function () {
  describe('parseCozyUrl', function () {
    it('parses https://example.com/', function () {
      let parsed = App.prototype.parseCozyUrl('https://example.com')
      parsed.protocol.should.equal('https:')
      parsed.host.should.equal('example.com')
    })

    it('parses example.org as https://example.org', function () {
      let parsed = App.prototype.parseCozyUrl('example.org')
      parsed.protocol.should.equal('https:')
      parsed.host.should.equal('example.org')
    })

    it('parses zoe as https://zoe.cozycloud.cc', function () {
      let parsed = App.prototype.parseCozyUrl('zoe')
      parsed.protocol.should.equal('https:')
      parsed.host.should.equal('zoe.cozycloud.cc')
    })

    it('parses http://localhost:9104', function () {
      let parsed = App.prototype.parseCozyUrl('http://localhost:9104')
      parsed.protocol.should.equal('http:')
      parsed.hostname.should.equal('localhost')
      parsed.port.should.equal('9104')
    })
  })

  describe('pingCozy', function () {
    const url = 'http://cozy.test'
    const statusUrl = `${url}/status`
    const basePath = './tmp'

    let fetch, fetchPromise, app

    beforeEach(function () {
      fetch = sinon.stub()
      fetchPromise = fetch.withArgs(statusUrl).returnsPromise()
      app = new App(basePath, fetch)
    })

    it('rejects unparsable URL', function () {
      return app.pingCozy('http://blah@://').should.be.rejectedWith(/invalid/i)
    })

    it('rejects non HTTP/HTTPS URL', function () {
      return app.pingCozy('irc://cozy.test').should.be.rejectedWith(/invalid/i)
    })

    context('when cozy is OK', () =>
      it('calls the callback with no argument', function () {
        fetchPromise.resolves({status: 200, json () { return {message: 'OK'} }})

        return app.pingCozy(url).should.be.fulfilledWith(url + '/')
      })
    )

    context('when cozy is KO', () =>
      it('calls the callback with a "KO" error', function () {
        fetchPromise.resolves({status: 200, json () { return {message: 'KO'} }})

        return app.pingCozy(url).should.be.rejectedWith(/KO/)
      })
    )

    context('when cozy sends an unexpected response code', () =>
      it('calls the callback with a "code" error', function () {
        fetchPromise.resolves({status: 404})

        return app.pingCozy(url).should.be.rejectedWith(/404/)
      })
    )

    context('when cozy sends an unexpected json response', () =>
      it('calls the callback with an "extract" error', function () {
        fetchPromise.resolves({status: 200, json () { return {couchdb: true} }})

        return app.pingCozy(url).should.be.rejectedWith(/extract/)
      })
    )

    context('when cozy could not be reached', () =>
      it('calls the callback with the error', function () {
        let err = new Error('some error')
        fetchPromise.rejects(err)

        return app.pingCozy(url).should.be.rejectedWith(err)
      })
    )
  })
})
