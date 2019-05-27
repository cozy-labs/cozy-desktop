/* eslint-env mocha */
/* @flow */

/*::
 import type { AtomWatcherEvent } from '../../../../core/local/atom/event'
 */

const should = require('should')
const checksumer = require('../../../../core/local/checksumer')
const addChecksum = require('../../../../core/local/atom/add_checksum')
const Channel = require('../../../../core/local/atom/channel')

describe('core/local/atom/add_checksum.loop()', () => {
  it('should add checksum within a file event', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'file',
        path: __filename
      }
    ]
    const channel = new Channel()
    channel.push(batch)
    const enhancedChannel = addChecksum.loop(channel, {
      checksumer: checksumer.init(),
      syncPath: ''
    })
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch)
      .be.an.Array()
      .and.length(batch.length)
    should.exist(enhancedBatch[0].md5sum)
  })

  it('should not add checksum within a not file event', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'directory',
        path: __dirname
      }
    ]
    const channel = new Channel()
    channel.push(batch)
    const enhancedChannel = addChecksum.loop(channel, {
      checksumer: checksumer.init(),
      syncPath: ''
    })
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch)
      .be.an.Array()
      .and.length(batch.length)
    should.not.exist(enhancedBatch[0].md5sum)
  })

  it('should not compute checksum if already present', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'file',
        path: __filename,
        md5sum: 'checksum'
      }
    ]
    const channel = new Channel()
    channel.push(batch)
    const enhancedChannel = addChecksum.loop(channel, {
      checksumer: checksumer.init(),
      syncPath: ''
    })
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch)
      .be.an.Array()
      .and.length(batch.length)
    should(enhancedBatch[0]).have.property('md5sum', 'checksum')
  })

  it('should work for every action except ignored', async () => {
    const checksum = await checksumer.computeChecksumAsync(__filename)
    const createdEvent = {
      action: 'created',
      kind: 'file',
      path: __filename
    }
    const modifiedEvent = {
      action: 'modified',
      kind: 'file',
      path: __filename
    }
    const scanEvent = {
      action: 'scan',
      kind: 'file',
      path: __filename
    }
    const renamedEvent = {
      action: 'renamed',
      kind: 'file',
      path: __filename
    }
    const ignoredEvent = {
      action: 'ignored',
      kind: 'file',
      path: __filename
    }
    const channel = new Channel()
    channel.push([
      createdEvent,
      modifiedEvent,
      scanEvent,
      renamedEvent,
      ignoredEvent
    ])
    const enhancedChannel = addChecksum.loop(channel, {
      checksumer: checksumer.init(),
      syncPath: ''
    })
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch).deepEqual([
      {
        ...createdEvent,
        md5sum: checksum
      },
      {
        ...modifiedEvent,
        md5sum: checksum
      },
      {
        ...scanEvent,
        md5sum: checksum
      },
      {
        ...renamedEvent,
        md5sum: checksum
      },
      ignoredEvent
    ])
  })
})
