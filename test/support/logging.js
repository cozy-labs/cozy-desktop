/* eslint-env mocha */
/* @flow */

import logger from '../../core/logger'

const log = logger({component: 'mocha'})

beforeEach(function () {
  // FIXME: this.currentTest is undefined on AppVeyor, not sure why
  if (process.env.APPVEYOR == null) {
    log.info('\n\n---------- ' + this.currentTest.title + ' ----------\n\n')
  }
})
