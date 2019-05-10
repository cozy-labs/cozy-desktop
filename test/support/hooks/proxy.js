/* eslint-env mocha */

const { app, session } = require('electron')
const setupProxy = require('../../../gui/js/proxy')

before(done => {
  setupProxy(app, session, done)
})
