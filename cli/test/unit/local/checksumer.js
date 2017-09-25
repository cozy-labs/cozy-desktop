/* eslint-env mocha */
/* @flow */

import should from 'should'

import { init } from '../../../src/local/checksumer'

describe('local/checksumer', () => {
  let checksumer

  beforeEach('init', () => {
    checksumer = init()
  })

  afterEach('kill', () => {
    checksumer.kill()
  })

  describe('push', () => {
    it('returns the checksum of an existing file', function (done) {
      let filePath = 'test/fixtures/chat-mignon.jpg'
      checksumer.push(filePath, function (err, sum) {
        should.not.exist(err)
        sum.should.equal('+HBGS7uN4XdB0blqLv5tFQ==')
        done()
      })
    })

    it('returns an error for a missing file', function (done) {
      let filePath = 'no/such/file'
      checksumer.push(filePath, function (err, sum) {
        should.exist(err)
        should(err).have.property('code', 'ENOENT')
        done()
      })
    })
  })
})
