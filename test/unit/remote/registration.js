/* eslint-env mocha */

import should from 'should'

import Registration from '../../../src/remote/registration'

import configHelpers from '../../helpers/config'

describe('Registration', function () {
  before('instanciate config', configHelpers.createConfig)
  after('clean config directory', configHelpers.cleanConfig)

  before('create a registration', function () {
    this.registration = new Registration(this.config.cozyUrl, this.config)
  })

  it('generates a unique device name', function () {
    const params = this.registration.clientParams({})
    should(params.clientName).not.be.empty()
    const otherName = this.registration.clientParams({}).clientName
    should(params.clientName).should.not.equal(otherName)
  })

  it('configures correctly the OAuth client', function () {
    const pkg = {
      homepage: 'https//github.com/cozy-labs/cozy-desktop',
      logo: 'https://cozy.io/cozy-desktop.logo',
      repository: 'git://github.com/cozy-labs/cozy-desktop.git'
    }
    const params = this.registration.clientParams(pkg)
    should(params.redirectURI).equal('http://localhost:3344/callback')
    should(params.softwareID).equal('github.com/cozy-labs/cozy-desktop')
    should(params.softwareVersion).equal('unknown')
    should(params.clientKind).equal('desktop')
    should(params.clientURI).equal(pkg.homepage)
    should(params.logoURI).equal(pkg.logo)
    should(params.scopes).eql([
      'io.cozy.files',
      'io.cozy.settings:GET:io.cozy.settings.disk-usage',
      'io.cozy.jobs:POST:sendmail:worker'
    ])
  })
})
