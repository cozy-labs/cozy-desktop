/* eslint-env mocha */
/* @flow */

/*::
import type { AtomWatcherEvent } from '../../../../core/local/steps/event'
*/

const should = require('should')
const addInfos = require('../../../../core/local/steps/add_infos')
const Buffer = require('../../../../core/local/steps/buffer')

describe('core/local/steps/add_infos.loop()', () => {
  it('should returns an enhanced batch with infos', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'unknown',
        path: __filename
      }
    ]
    const buffer = new Buffer()
    buffer.push(batch)
    const enhancedBuffer = addInfos.loop(buffer, {
      syncPath: ''
    })
    const enhancedBatch = await enhancedBuffer.pop()
    should(enhancedBatch)
      .be.an.Array()
      .and.have.length(batch.length)
  })

  it('should add specific infos for specific events', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'directory',
        path: '/'
      },
      {
        action: 'created',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'modified',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'renamed',
        kind: 'directory',
        path: __dirname
      }
    ]
    const buffer = new Buffer()
    buffer.push(batch)
    const enhancedBuffer = addInfos.loop(buffer, {
      syncPath: ''
    })
    const [scanEvent, ...otherEvents] = await enhancedBuffer.pop()
    should(scanEvent).eql({
      action: batch[0].action,
      kind: 'directory',
      path: batch[0].path,
      _id: batch[0].path
    })
    otherEvents.forEach(event => {
      should.exist(event._id)
      should.exist(event.stats)
      should.exist(event.kind)
      should(event.kind).eql('directory')
    })
  })
})
