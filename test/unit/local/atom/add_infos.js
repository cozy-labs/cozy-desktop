/* eslint-env mocha */
/* @flow */

const should = require('should')
const metadata = require('../../../../core/metadata')
const addInfos = require('../../../../core/local/atom/add_infos')
const Channel = require('../../../../core/local/atom/channel')

describe('core/local/atom/add_infos.loop()', () => {
  it('should returns an enhanced batch with infos', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'unknown',
        path: __filename
      }
    ]
    const channel = new Channel()
    channel.push(batch)
    const enhancedChannel = addInfos.loop(channel, {
      syncPath: ''
    })
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch)
      .be.an.Array()
      .and.have.length(batch.length)
  })

  it('should add specific infos for specific events', async () => {
    const batch = [
      {
        action: 'deleted',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'ignored',
        kind: 'directory',
        path: __dirname
      },
      {
        action: 'scan',
        kind: 'directory',
        path: __dirname
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
    const channel = new Channel()
    channel.push(batch)
    const enhancedChannel = addInfos.loop(channel, {
      syncPath: ''
    })
    const [
      deletedEvent,
      ignoredEvent,
      ...otherEvents
    ] = await enhancedChannel.pop()
    should(deletedEvent).eql({
      action: batch[0].action,
      kind: 'directory',
      path: batch[0].path,
      _id: metadata.id(batch[0].path)
    })
    should(ignoredEvent).eql({
      action: batch[1].action,
      kind: 'directory',
      path: batch[1].path,
      _id: metadata.id(batch[1].path)
    })
    otherEvents.forEach(event => {
      should(event._id).eql(metadata.id(event.path))
      should(event.kind).eql('directory')
      should.exist(event.stats)
    })
  })
})
