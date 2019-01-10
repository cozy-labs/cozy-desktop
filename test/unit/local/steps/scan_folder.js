/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')
const scanFolder = require('../../../../core/local/steps/scan_folder')
const Buffer = require('../../../../core/local/steps/buffer')

describe('core/local/steps/scan_folder', () => {
  it('should call the producer scan for action `created` only', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'renamed',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'modified',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'deleted',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'initial-scan-done',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'created',
        kind: 'directory',
        path: __dirname
      }
    ]
    const buffer = new Buffer()
    buffer.push(batch)
    const opts = {
      producer: {
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        scan: sinon.stub().resolves()
      }
    }
    const enhancedBuffer = scanFolder(buffer, opts)
    const enhancedBatch = await enhancedBuffer.pop()
    should(enhancedBatch).be.length(batch.length)
    should(opts.producer.scan).be.calledOnce()
  })

  it('should call the producer scan for each action `created`', async () => {
    const batch = [
      {
        action: 'created',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'created',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'created',
        kind: 'directory',
        path: __dirname
      }
    ]
    const buffer = new Buffer()
    buffer.push(batch)
    const opts = {
      producer: {
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        scan: sinon.stub().resolves()
      }
    }
    const enhancedBuffer = scanFolder(buffer, opts)
    const enhancedBatch = await enhancedBuffer.pop()
    should(enhancedBatch).be.length(batch.length)
    should(opts.producer.scan).be.calledThrice()
  })

  it('should call the producer scan for kind `directory` only', async () => {
    const batch = [
      {
        action: 'created',
        kind: 'file',
        path: __dirname
      },
      {
        action: 'created',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'created',
        kind: 'directory',
        path: __dirname
      }
    ]
    const buffer = new Buffer()
    buffer.push(batch)
    const opts = {
      producer: {
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        scan: sinon.stub().resolves()
      }
    }
    const enhancedBuffer = scanFolder(buffer, opts)
    const enhancedBatch = await enhancedBuffer.pop()
    should(enhancedBatch).be.length(batch.length)
    should(opts.producer.scan).be.calledTwice()
  })
})
