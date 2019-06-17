/* eslint-env mocha */

require('should')

const sentry = require('../../../core/utils/sentry')

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
})
