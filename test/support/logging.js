/* eslint-env mocha */
/* @flow */

const logger = require('../../core/logger')

const { defaultLogger } = logger
const log = logger({component: 'mocha'})

const lines = []

defaultLogger.addStream({
  type: 'raw',
  level: 'trace',
  stream: {
    write: function (msg) {
      lines.push(msg)
    }
  }
})

beforeEach(function () {
  lines.length = 0
  // FIXME: this.currentTest is undefined on AppVeyor, not sure why
  if (process.env.APPVEYOR == null) {
    log.info('\n\n---------- ' + this.currentTest.title + ' ----------\n\n')
  }
})

afterEach(function () {
  if (this.currentTest.state === 'failed') {
    console.log(lines.map(l => JSON.stringify(l)).join('\n'))
  }
})
