/* eslint-env mocha */

const { app, session } = require('electron')
const proxy = require('../../../gui/js/proxy')
const { APPVEYOR, TRAVIS } = process.env

const userAgentHost = APPVEYOR ? 'AppVeyor' : TRAVIS ? 'Travis' : 'local'
const userAgent = `Cozy-Desktop-${process.platform}-dev-${userAgentHost}`

before(done => {
  proxy.setup(app, proxy.config(), session, userAgent, () => done())
})
