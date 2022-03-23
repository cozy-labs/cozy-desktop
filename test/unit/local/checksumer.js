/* eslint-env mocha */
/* @flow */

const fs = require('fs')
const should = require('should')
const sinon = require('sinon')
const { Readable } = require('stream')

const { init } = require('../../../core/local/checksumer')

describe('local/checksumer', () => {
  const sandbox = sinon.createSandbox()

  let checksumer
  beforeEach('init', () => {
    checksumer = init()
  })

  afterEach(() => {
    sandbox.restore()
  })
  afterEach('kill', () => {
    checksumer.kill()
  })

  describe('push', () => {
    it('resolves with the checksum of an existing file', async () => {
      await should(
        checksumer.push('test/fixtures/chat-mignon.jpg')
      ).be.fulfilledWith('+HBGS7uN4XdB0blqLv5tFQ==')
    })

    it('rejects for a missing file', async () => {
      await should(checksumer.push('no/such/file')).be.rejectedWith({
        code: 'ENOENT'
      })
    })

    describe('on EBUSY error', () => {
      const busyStream = () => {
        const stream = new Readable({ read: () => {} })
        setTimeout(() => {
          stream.emit('error', { code: 'EBUSY' })
        }, 1000)
        return stream
      }

      let createReadStream

      beforeEach(() => {
        createReadStream = sandbox.stub(fs, 'createReadStream')
      })

      it('retries until success', async () => {
        createReadStream.callsFake(() => {
          createReadStream.restore()
          return busyStream()
        })

        await should(
          checksumer.push('test/fixtures/chat-mignon.jpg')
        ).be.fulfilledWith('+HBGS7uN4XdB0blqLv5tFQ==')
      })

      it.skip('fails on successive errors', async function () {
        this.timeout(60000)
        createReadStream.callsFake(() => {
          return busyStream()
        })

        await should(checksumer.push('whatever-busy')).be.rejectedWith({
          code: 'EBUSY'
        })
      })
    })
  })
})
