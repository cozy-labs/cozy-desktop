/* eslint-env mocha */
/* @flow */
const winston = require('winston')

const { defaultLogger, logger } = require('../../../core/utils/logger')

const log = logger({ component: 'mocha' })

const errors = []

defaultLogger.add(
  new winston.Transport({
    level: 'error',
    log: ({ err, message }, callback) => {
      errors.push(err || message)

      callback()
    }
  })
)

beforeEach(function () {
  errors.length = 0
  // FIXME: this.currentTest is undefined on AppVeyor, not sure why
  if (process.env.APPVEYOR == null) {
    log.info('\n\n---------- ' + this.currentTest.title + ' ----------\n\n')
  }
})

afterEach(function () {
  for (const err of errors) {
    // eslint-disable-next-line no-console
    console.log(err)
  }
})
