/* eslint-env mocha */
/* @flow */

const should = require('should')

const { LocalFsError } = require('../../../core/local/errors')
const remoteErrors = require('../../../core/remote/errors')

const makeError = (message /*: string */, code /*: ?string */) => {
  const err = (new Error(message) /*: Error & { code?: string } */)
  if (code) err.code = code
  return err
}

describe('Remote.wrapError', () => {
  it('returns an UnreachableCozy error for net::ERR_NETWORKD_CHANGED errors', () => {
    should(
      remoteErrors.wrapError(
        makeError('Failed request, reason: net::ERR_NETWORKD_CHANGED')
      )
    ).have.property('code', remoteErrors.UNREACHABLE_COZY_CODE)
  })

  it('returns an UnreachableCozy error for mid-transfer network errors', () => {
    const interruptedErrors = [
      makeError('read ECONNRESET', 'ECONNRESET'),
      makeError(
        'request to https://instance.twake.app failed, reason: read ECONNRESET'
      ),
      makeError('request timed out', 'ETIMEDOUT'),
      makeError('HTTP/2 stream failure', 'ERR_HTTP2_PROTOCOL_ERROR'),
      makeError('mojo result is not ok')
    ]

    for (const interruptedError of interruptedErrors) {
      should(remoteErrors.wrapError(interruptedError)).have.property(
        'code',
        remoteErrors.UNREACHABLE_COZY_CODE
      )
    }
  })

  it('keeps non-network errors as UnknownRemoteError', () => {
    should(
      remoteErrors.wrapError(makeError('Cannot read property of undefined'))
    ).have.property('code', remoteErrors.UNKNOWN_REMOTE_ERROR_CODE)
  })

  it('keeps local file system errors as UnknownRemoteError', () => {
    should(
      remoteErrors.wrapError(
        new LocalFsError(makeError('read ECONNRESET', 'ECONNRESET'))
      )
    ).have.property('code', remoteErrors.UNKNOWN_REMOTE_ERROR_CODE)
  })

  it('returns an already classified RemoteError as-is', () => {
    const err = new remoteErrors.RemoteError({
      code: remoteErrors.USER_ACTION_REQUIRED_CODE,
      message: 'Payment required',
      err: makeError('read ECONNRESET', 'ECONNRESET')
    })

    should(remoteErrors.wrapError(err)).be.equal(err)
  })
})

describe('Remote.isRetryableNetworkError', () => {
  it('returns true for transient network errors', () => {
    const transientErrors = [
      makeError('Failed request, reason: net::ERR_NETWORK_CHANGED'),
      makeError('read ECONNRESET', 'ECONNRESET'),
      makeError('request failed, reason: read ECONNRESET'),
      makeError('HTTP/2 stream failure', 'ERR_HTTP2_PROTOCOL_ERROR'),
      makeError('mojo result is not ok')
    ]

    for (const transientError of transientErrors) {
      should(remoteErrors.isRetryableNetworkError(transientError)).be.true()
    }
  })

  it('matches interruption signatures as whole words only', () => {
    should(
      remoteErrors.isRetryableNetworkError(
        makeError('read ECONNRESET from peer')
      )
    ).be.true()
    should(
      remoteErrors.isRetryableNetworkError(makeError('failure: EPIPE (socket)'))
    ).be.true()

    should(
      remoteErrors.isRetryableNetworkError(
        makeError('cannot resolve EPIPEFILE')
      )
    ).be.false()
    should(
      remoteErrors.isRetryableNetworkError(makeError('some unrelated failure'))
    ).be.false()
  })

  it('returns false for disconnection and non-network errors', () => {
    const nonRetryableErrors = [
      makeError('Failed request, reason: net::ERR_INTERNET_DISCONNECTED'),
      makeError('Failed request, reason: net::ERR_PROXY_CONNECTION_FAILED'),
      makeError('Cannot read property of undefined')
    ]

    for (const nonRetryableError of nonRetryableErrors) {
      should(remoteErrors.isRetryableNetworkError(nonRetryableError)).be.false()
    }
  })

  it('returns false for local file system errors', () => {
    const localErrors = [
      new LocalFsError(makeError('read ECONNRESET', 'ECONNRESET')),
      new LocalFsError(makeError('failed to copy file', 'EPERM'))
    ]

    for (const localError of localErrors) {
      should(remoteErrors.isRetryableNetworkError(localError)).be.false()
    }
  })
})
