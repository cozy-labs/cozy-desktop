/* eslint-env mocha */

const { URL } = require('url')
const setupProxy = require('../../../gui/js/proxy')
const { COZY_URL } = require('../../support/helpers/cozy')

describe('gui/setupProxy', () => {
  it('does not break networking', done => {
    const { app, session } = require('electron')
    const userAgent = 'whatever'

    setupProxy(app, session, userAgent, () => {
      fetch(new URL('/status', COZY_URL))
        .then(() => done())
        .catch(done)
    })
  })
})
