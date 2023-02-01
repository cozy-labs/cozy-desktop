/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')
const scanFolder = require('../../../../core/local/channel_watcher/scan_folder')
const Channel = require('../../../../core/local/channel_watcher/channel')

const setup = batch => {
  const channel = new Channel()
  channel.push(batch)
  const scan = sinon.stub().resolves()
  const fatal = sinon.spy()

  return { channel, scan, fatal }
}

describe('core/local/channel_watcher/scan_folder.loop()', () => {
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
      },
      {
        action: 'ignored',
        kind: 'directory',
        path: __dirname
      }
    ]
    const { channel, scan, fatal } = setup(batch)
    const enhancedChannel = scanFolder.loop(channel, { scan, fatal })
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch).be.length(batch.length)
    should(scan).be.calledOnce()
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
    const { channel, scan, fatal } = setup(batch)
    const enhancedChannel = scanFolder.loop(channel, { scan, fatal })
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch).be.length(batch.length)
    should(scan).be.calledThrice()
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
    const { channel, scan, fatal } = setup(batch)
    const enhancedChannel = scanFolder.loop(channel, { scan, fatal })
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch).be.length(batch.length)
    should(scan).be.calledTwice()
  })
})
