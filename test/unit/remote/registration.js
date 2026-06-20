/* eslint-env mocha */

const os = require('os')

const should = require('should')
const sinon = require('sinon')

const config = require('../../../core/config')
const Registration = require('../../../core/remote/registration')
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

  describe('process', function() {
    context('when registration fails', function() {
      beforeEach('persist stale credentials on disk', function() {
        this.config.client = {
          clientID: 'stale-client-id',
          clientSecret: 'stale-secret',
          clientName: 'test',
          redirectURI: 'http://localhost:3344/callback'
        }
        this.config.persist()
      })

      afterEach(function() {
        sinon.restore()
      })

      it('clears the stale credentials from disk', async function() {
        sinon
          .stub(this.registration, 'oauthClient')
          .throws(new Error('registration failure'))

        await should(this.registration.process({})).be.rejectedWith(
          'registration failure'
        )

        const persisted = config.loadOrDeleteFile(this.config.configPath)
        should(persisted.creds).be.undefined()
      })
    })
  })
})
