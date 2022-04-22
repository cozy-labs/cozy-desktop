/* eslint-env mocha */
/* @flow */

const should = require('should')

const remoteErrors = require('../../../core/remote/errors')

describe('Remote.wrapError', () => {
  it('returns an UnreachableCozy error for net::ERR_NETWORKD_CHANGED errors', () => {
    const netErr = new Error(
      'Failed request, reason: net::ERR_NETWORKD_CHANGED'
    )
    should(remoteErrors.wrapError(netErr)).have.property(
      'code',
      remoteErrors.UNREACHABLE_COZY_CODE
    )
  })
})
