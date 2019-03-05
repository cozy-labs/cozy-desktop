/* eslint-env mocha */
/* @flow */

const logger = require('../../core/logger')

const { defaultLogger } = logger
const log = logger({component: 'mocha'})

const errors = []

defaultLogger.addStream({
  type: 'raw',
  level: 'error',
  stream: {
    write: function (msg) {
      errors.push(msg.err || msg)
    }
  }
})

beforeEach(function () {
  errors.length = 0
  // FIXME: this.currentTest is undefined on AppVeyor, not sure why
  if (process.env.APPVEYOR == null) {
    log.info('\n\n---------- ' + this.currentTest.title + ' ----------\n\n')
  }
})

afterEach(function () {
  for (const err of errors) {
    console.error(err)
  }
})
