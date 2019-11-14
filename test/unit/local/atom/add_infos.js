/* eslint-env mocha */
/* @flow */

const should = require('should')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

const metadata = require('../../../../core/metadata')
const addInfos = require('../../../../core/local/atom/add_infos')
const Channel = require('../../../../core/local/atom/channel')

describe('core/local/atom/add_infos.loop()', () => {
  let builders
  let opts

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate builders', async function() {
    builders = new Builders({ pouch: this.pouch })
  })
  beforeEach('create step opts', async function() {
    opts = {
      syncPath: '',
      pouch: this.pouch
    }
  })

  it('returns an enhanced batch with infos', async () => {
    const batch = [
      {
        action: 'scan',
        kind: 'unknown',
        path: __filename
      }
    ]
    const channel = new Channel()
    channel.push(batch)
    const enhancedChannel = addInfos.loop(channel, opts)
    const enhancedBatch = await enhancedChannel.pop()
    should(enhancedBatch)
      .be.an.Array()
      .and.have.length(batch.length)
  })

  it('adds specific infos for specific events', async () => {
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
    const enhancedChannel = addInfos.loop(channel, opts)
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

  context('when deleted event kind is unknown', () => {
    context('and document exists in Pouch', () => {
      beforeEach('populate Pouch with documents', async function() {
        await builders
          .metafile()
          .path('file')
          .create()
        await builders
          .metadir()
          .path('dir')
          .create()
      })

      it('looks up existing document doctype from Pouch', async () => {
        const batch = [
          {
            action: 'deleted',
            kind: 'unknown',
            path: 'file'
          },
          {
            action: 'deleted',
            kind: 'unknown',
            path: 'dir'
          }
        ]
        const channel = new Channel()
        channel.push(batch)
        const enhancedChannel = addInfos.loop(channel, opts)

        should(await enhancedChannel.pop()).deepEqual([
          {
            action: 'deleted',
            kind: 'file',
            path: 'file',
            _id: metadata.id('file'),
            [addInfos.STEP_NAME]: { kindConvertedFrom: 'unknown' }
          },
          {
            action: 'deleted',
            kind: 'directory',
            path: 'dir',
            _id: metadata.id('dir'),
            [addInfos.STEP_NAME]: { kindConvertedFrom: 'unknown' }
          }
        ])
      })
    })

    context('and document was never saved in Pouch', () => {
      it('forces kind to file for unknown documents', async () => {
        const batch = [
          {
            action: 'deleted',
            kind: 'unknown',
            path: __filename
          },
          {
            action: 'deleted',
            kind: 'unknown',
            path: __dirname
          }
        ]
        const channel = new Channel()
        channel.push(batch)
        const enhancedChannel = addInfos.loop(channel, opts)

        should(await enhancedChannel.pop()).deepEqual([
          {
            action: 'deleted',
            kind: 'file',
            path: __filename,
            _id: metadata.id(__filename),
            [addInfos.STEP_NAME]: { kindConvertedFrom: 'unknown' }
          },
          {
            action: 'deleted',
            kind: 'file',
            path: __dirname,
            _id: metadata.id(__dirname),
            [addInfos.STEP_NAME]: { kindConvertedFrom: 'unknown' }
          }
        ])
      })
    })
  })
})
