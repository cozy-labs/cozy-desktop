/* eslint-env mocha */
/* @flow */

const should = require('should')

const remoteErrors = require('../../../core/remote/errors')
const syncErrors = require('../../../core/sync/errors')

describe('Sync.wrapError', () => {
  it('returns an UnreachableCozy error for net::ERR_NETWORKD_CHANGED errors', () => {
    const netErr = new Error(
      'Failed request, reason: net::ERR_NETWORKD_CHANGED'
    )
    should(syncErrors.wrapError(netErr, 'local')).have.property(
      'code',
      remoteErrors.UNREACHABLE_COZY_CODE
    )
  })
})
