/* eslint-env mocha */

const should = require('should')
const fs = require('fs')

const sentry = require('../../../core/utils/sentry')
const { FetchError } = require('electron-fetch')

// This class is a copy of the `cozy-client-js` package's `FetchError` as it is
// not exported and could therefore not be imported.
class CozyClientFetchError extends Error {
  constructor(res, reason) {
    super()
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
    this.name = 'FetchError'
    this.response = res
    this.url = res.url
    this.status = res.status
    this.reason = reason

    Object.defineProperty(this, 'message', {
      message:
        reason.message ||
        (typeof reason === 'string' ? reason : JSON.stringify(reason))
    })
  }
}

describe('Sentry', function() {
  describe('toSentryContext', function() {
    it('properly parse all urls', function() {
      sentry
        .toSentryContext('https://somedevcozy.cozy.tools:8080')
        .should.deepEqual({
          domain: 'cozy.tools',
          instance: 'somedevcozy.cozy.tools',
          environment: 'development'
        })

      sentry.toSentryContext('https://example.mycozy.cloud').should.deepEqual({
        domain: 'mycozy.cloud',
        instance: 'example.mycozy.cloud',
        environment: 'production'
      })

      sentry.toSentryContext('https://mycozy-example.com').should.deepEqual({
        domain: 'mycozy-example.com',
        instance: 'mycozy-example.com',
        environment: 'selfhost'
      })
    })
  })

  describe('format', function() {
    it('formats Node system errors', () => {
      try {
        fs.readFileSync(`${__filename}.missing-file`)
      } catch (err) {
        const result = sentry.format(err)
        should(result).be.an.instanceof(Error)
        should(result).have.properties({
          type: 'Error',
          message: 'ENOENT'
        })
        return
      }
      should.fail()
    })

    it('formats system FetchError', () => {
      const err = new FetchError('reason', 'system', { code: 'ECONNREFUSED' })

      const result = sentry.format(err)
      should(result).be.an.instanceof(Error)
      should(result).have.properties({
        type: 'FetchError',
        message: 'ECONNREFUSED'
      })
    })

    it('formats electron-feth FetchError', () => {
      const err = new FetchError(
        `network timeout at: https://localhost`,
        'request-timeout'
      )

      const result = sentry.format(err)
      should(result).be.an.instanceof(Error)
      should(result).have.properties({
        type: 'FetchError',
        message: 'request-timeout'
      })
    })

    it('formats electron-fetch proxy FetchError', () => {
      const err = new FetchError(
        `login event received from myproxy.local but no credentials provided`,
        'proxy',
        { code: 'PROXY_AUTH_FAILED' }
      )

      const result = sentry.format(err)
      should(result).be.an.instanceof(Error)
      should(result).have.properties({
        type: 'FetchError',
        message: 'PROXY_AUTH_FAILED'
      })
    })

    it('formats cozy-client-js FetchError with JSON body', async () => {
      const response = new Response(
        JSON.stringify({
          errors: [
            {
              status: 412,
              title: 'Precondition Failed',
              detail: 'Invalid hash',
              source: { parameter: 'Content-MD5' }
            }
          ]
        }),
        { status: 412 }
      )
      const reason = await response.json()
      const err = new CozyClientFetchError(response, reason)

      const result = sentry.format(err)
      should(result).be.an.instanceof(Error)
      should(result).have.properties({
        type: 'FetchError',
        message: 'Invalid hash'
      })
    })

    it('formats cozy-client-js FetchError with text body', async () => {
      const response = new Response('Not Found', {
        status: 404,
        statusText: 'Not Found'
      })
      const reason = await response.text()
      const err = new CozyClientFetchError(response, reason)

      const result = sentry.format(err)
      should(result).be.an.instanceof(Error)
      should(result).have.properties({
        type: 'FetchError',
        message: 'Not Found'
      })
    })
  })
})
