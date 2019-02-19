/* eslint-env mocha */
/* @flow */

/*::
 import type { AtomWatcherEvent } from '../../../../core/local/steps/event'
 */

const should = require('should')
const checksumer = require('../../../../core/local/checksumer')
const addChecksum = require('../../../../core/local/steps/add_checksum')
const Buffer = require('../../../../core/local/steps/buffer')

describe('core/local/steps/add_checksum.loop()', () => {
  it('should add checksum within a file event', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'file',
        path: __filename
      }
    ]
    const buffer = new Buffer()
    buffer.push(batch)
    const enhancedBuffer = addChecksum.loop(buffer, {
      checksumer: checksumer.init(),
      syncPath: ''
    })
    const enhancedBatch = await enhancedBuffer.pop()
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
    const buffer = new Buffer()
    buffer.push(batch)
    const enhancedBuffer = addChecksum.loop(buffer, {
      checksumer: checksumer.init(),
      syncPath: ''
    })
    const enhancedBatch = await enhancedBuffer.pop()
    should(enhancedBatch)
      .be.an.Array()
      .and.length(batch.length)
    should.not.exist(enhancedBatch[0].md5sum)
  })
  it('should work for every action', async () => {
    const batch = [
      {
        action: 'created',
        kind: 'file',
        path: __filename
      },
      {
        action: 'modified',
        kind: 'file',
        path: __filename
      },
      {
        action: 'scan',
        kind: 'file',
        path: __filename
      },
      {
        action: 'renamed',
        kind: 'file',
        path: __filename
      }
    ]
    const buffer = new Buffer()
    buffer.push(batch)
    const enhancedBuffer = addChecksum.loop(buffer, {
      checksumer: checksumer.init(),
      syncPath: ''
    })
    const enhancedBatch = await enhancedBuffer.pop()
    should(enhancedBatch)
      .be.an.Array()
      .and.length(batch.length)
    enhancedBatch.forEach(event => {
      should.exist(event.md5sum)
    })
  })
})
