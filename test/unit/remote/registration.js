/* eslint-env mocha */

const os = require('os')

const should = require('should')

const {
  OIDC_CALLBACK_CLOSED,
  Registration,
  waitForOIDCCallback
} = require('../../../core/remote/registration')
const configHelpers = require('../../support/helpers/config')

describe('Registration', function() {
  before('instanciate config', configHelpers.createConfig)
  after('clean config directory', configHelpers.cleanConfig)

  before('create a registration', function() {
    this.registration = new Registration(this.config.cozyUrl, this.config)
  })

  describe('oauthClient', function() {
    it('generates a device name based on the hostname', function() {
      const { clientName } = this.registration.oauthClient({})
      should(clientName).match(/Twake Desktop/)
      should(clientName.includes(os.hostname())).be.true()
    })

    it('configures correctly the OAuth client', function() {
      const pkg = {
        homepage: 'https//github.com/cozy-labs/cozy-desktop',
        logo: 'https://cozy.io/cozy-desktop.logo',
        repository: 'git://github.com/cozy-labs/cozy-desktop.git'
      }
      const params = this.registration.oauthClient(pkg)
      should(params.redirectURI).equal('http://localhost:3344/callback')
      should(params.softwareID).equal('github.com/cozy-labs/cozy-desktop')
      should(params.softwareVersion).equal('unknown')
      should(params.clientKind).equal('desktop')
      should(params.clientURI).equal(pkg.homepage)
      should(params.logoURI).equal(pkg.logo)
    })
  })

  describe('waitForOIDCCallback', function() {
    let waiter

    afterEach(function() {
      if (waiter) waiter.close()
      waiter = null
    })

    it('listens on an ephemeral loopback port', async function() {
      waiter = await waitForOIDCCallback()
      should(waiter.callbackURL).match(
        /^http:\/\/127\.0\.0\.1:\d+\/callback\?state=[0-9a-f]{32}$/
      )
    })

    it('resolves the callback params and answers the browser', async function() {
      waiter = await waitForOIDCCallback()
      const responseP = fetch(
        `${waiter.callbackURL}&code=the-code&fqdn=example.cozy.cloud`
      )
      const params = await waiter.params

      should(params.get('code')).equal('the-code')
      should(params.get('fqdn')).equal('example.cozy.cloud')
      should(params.get('state')).equal(
        new URL(waiter.callbackURL).searchParams.get('state')
      )

      const response = await responseP
      should(response.status).equal(200)
      should(response.headers.get('content-type')).match(/text\/html/)
      should(await response.text()).match(/Login successful/)
    })

    it('serves the given success page when provided', async function() {
      waiter = await waitForOIDCCallback({
        successPage:
          '<!DOCTYPE html><html><body>custom success page</body></html>'
      })
      const responseP = fetch(
        `${waiter.callbackURL}&code=the-code&fqdn=example.cozy.cloud`
      )
      await waiter.params
      const response = await responseP
      should(response.status).equal(200)
      should(response.headers.get('content-type')).match(/charset=utf-8/)
      should(await response.text()).match(/custom success page/)
    })

    it('answers 404 on other paths', async function() {
      waiter = await waitForOIDCCallback()
      const otherURL = waiter.callbackURL.replace('/callback', '/other')
      const response = await fetch(otherURL)
      should(response.status).equal(404)

      const extendedURL = waiter.callbackURL.replace(
        '/callback',
        '/callback/extra'
      )
      const extendedResponse = await fetch(extendedURL)
      should(extendedResponse.status).equal(404)
    })

    it('answers 400 on missing or wrong state and does not resolve', async function() {
      waiter = await waitForOIDCCallback()
      const withoutState = await fetch(waiter.callbackURL.split('?')[0])
      should(withoutState.status).equal(400)

      const withWrongState = await fetch(`${waiter.callbackURL}x`)
      should(withWrongState.status).equal(400)

      const { close, params } = waiter
      close()
      waiter = null

      let rejection = null
      try {
        await params
      } catch (err) {
        rejection = err
      }
      should(rejection).not.be.null()
      should(rejection.code).equal(OIDC_CALLBACK_CLOSED)
    })

    it('rejects params when closed before any callback', async function() {
      waiter = await waitForOIDCCallback()
      const { close, params } = waiter
      close()
      waiter = null

      let rejection = null
      try {
        await params
      } catch (err) {
        rejection = err
      }
      should(rejection).not.be.null()
      should(rejection.message).equal(
        'OIDC callback server closed without a callback'
      )
      should(rejection.code).equal(OIDC_CALLBACK_CLOSED)
    })
  })
})
