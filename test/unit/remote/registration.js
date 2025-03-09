/* eslint-env mocha */

const os = require('os')

const should = require('should')

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
      should(clientName).match(/Cozy Drive/)
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
})
