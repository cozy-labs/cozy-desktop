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
    it('resolves with the checksum of an existing file', async () => {
      await should(checksumer.push('test/fixtures/chat-mignon.jpg'))
        .be.fulfilledWith('+HBGS7uN4XdB0blqLv5tFQ==')
    })

    it('rejects for a missing file', async () => {
      await should(checksumer.push('no/such/file'))
        .be.rejectedWith({code: 'ENOENT'})
    })
  })
})
