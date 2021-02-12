/* eslint-env mocha */
/* @flow */

const should = require('should')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

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
      path: batch[0].path
    })
    should(ignoredEvent).eql({
      action: batch[1].action,
      kind: 'directory',
      path: batch[1].path
    })
    otherEvents.forEach(event => {
      should(event.kind).eql('directory')
      should.exist(event.stats)
    })
  })

  context('when deleted event kind is unknown', () => {
    context('and document exists in Pouch', () => {
      let file, dir
      beforeEach('populate Pouch with documents', async function() {
        file = await builders
          .metafile()
          .path('file')
          .ino(1)
          .upToDate()
          .create()
        dir = await builders
          .metadir()
          .path('dir')
          .ino(2)
          .upToDate()
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
            [addInfos.STEP_NAME]: { kindConvertedFrom: 'unknown' },
            deletedIno: file.local.fileid || file.local.ino
          },
          {
            action: 'deleted',
            kind: 'directory',
            path: 'dir',
            [addInfos.STEP_NAME]: { kindConvertedFrom: 'unknown' },
            deletedIno: dir.local.fileid || dir.local.ino
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
            [addInfos.STEP_NAME]: { kindConvertedFrom: 'unknown' }
          },
          {
            action: 'deleted',
            kind: 'file',
            path: __dirname,
            [addInfos.STEP_NAME]: { kindConvertedFrom: 'unknown' }
          }
        ])
      })
    })
  })

  context(
    'when deleted document has different remote & synced path in Pouch',
    () => {
      let file, dir
      beforeEach('populate Pouch with documents', async function() {
        file = await builders
          .metafile()
          .path('file')
          .ino(1)
          .upToDate()
          .create()
        await builders
          .metafile(file)
          .path('other-file')
          .changedSide('remote')
          .create()
        dir = await builders
          .metadir()
          .path('dir')
          .ino(2)
          .upToDate()
          .create()
        await builders
          .metadir(dir)
          .path('other-dir')
          .changedSide('remote')
          .create()
      })

      it('still finds its deleted local inode', async () => {
        const batch = [
          {
            action: 'deleted',
            kind: 'file',
            path: 'file'
          },
          {
            action: 'deleted',
            kind: 'directory',
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
            deletedIno: file.local.fileid || file.local.ino
          },
          {
            action: 'deleted',
            kind: 'directory',
            path: 'dir',
            deletedIno: dir.local.fileid || dir.local.ino
          }
        ])
      })
    }
  )
})
