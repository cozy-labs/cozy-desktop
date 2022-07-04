/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')

const awaitWriteFinish = require('../../../../core/local/channel_watcher/await_write_finish')
const Channel = require('../../../../core/local/channel_watcher/channel')
const Builders = require('../../../support/builders')

const lastEventToCheckEmptyness = {
  action: 'initial-scan-done',
  kind: 'unknown',
  path: ''
}

const builders = new Builders()

async function heuristicIsEmpty(channel) {
  const expected = await channel.pop()
  return (
    (expected.length === 1 &&
      Object.keys(expected[0]).reduce(
        (acc, prop) =>
          acc && expected[0][prop] === lastEventToCheckEmptyness[prop],
        true
      )) ||
    console.log(expected) // eslint-disable-line no-console
  )
}

function aggregatedStats(event) {
  return _.pick(event.stats, [
    'ino',
    'fileid',
    'size',
    'atime',
    'mtime',
    'ctime',
    'birthtime'
  ])
}

describe('core/local/channel_watcher/await_write_finish.loop()', () => {
  context('with many batches', () => {
    it('should reduce created→deleted to empty', async () => {
      const channel = new Channel()
      const originalBatch = [
        builders
          .event()
          .action('created')
          .kind('file')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('deleted')
          .kind('file')
          .path(__filename)
          .build(),
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should reduce modified→deleted to deleted', async () => {
      const modified = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .build()
      const deleted = builders
        .event()
        .action('deleted')
        .kind('file')
        .path(__filename)
        .deletedIno(1)
        .build()

      const channel = new Channel()
      const originalBatch = [modified, deleted, lastEventToCheckEmptyness]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([deleted])
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should reduce modified→deleted with different inodes to deleted', async () => {
      const modified = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(2)
        .build()
      const deleted = builders
        .event()
        .action('deleted')
        .kind('file')
        .path(__filename)
        .deletedIno(1)
        .build()

      const channel = new Channel()
      const originalBatch = [modified, deleted, lastEventToCheckEmptyness]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([deleted])
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should reduce created→modified→modified to created', async () => {
      const created = builders
        .event()
        .action('created')
        .kind('file')
        .path(__filename)
        .ino(1)
        .build()
      const modified1 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(1)
        .build()
      const modified2 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(2)
        .build()

      const channel = new Channel()
      const originalBatch = [
        created,
        modified1,
        modified2,
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          // 3rd modified -> created
          action: 'created',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 2nd modified -> created
                action: 'created',
                stats: aggregatedStats(modified1)
              },
              {
                // 1st created
                action: 'created',
                stats: aggregatedStats(created)
              }
            ]
          },
          kind: 'file',
          path: __filename,
          stats: modified2.stats
        }
      ])
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should reduce created→modified→modified→deleted to empty', async () => {
      const channel = new Channel()
      const originalBatch = [
        builders
          .event()
          .action('created')
          .kind('file')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('modified')
          .kind('file')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('modified')
          .kind('file')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('deleted')
          .kind('file')
          .path(__filename)
          .build(),
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should reduce renamed→modified→modified to renamed', async () => {
      const renamed = builders
        .event()
        .action('renamed')
        .kind('file')
        .oldPath('whatever.txt')
        .path(__filename)
        .ino(1)
        .build()
      const modified1 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(1)
        .build()
      const modified2 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(2)
        .build()

      const channel = new Channel()
      const originalBatch = [
        renamed,
        modified1,
        modified2,
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          action: 'renamed',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 1st modified
                action: 'renamed',
                stats: aggregatedStats(modified1)
              },
              {
                // 1st renamed
                action: 'renamed',
                stats: aggregatedStats(renamed)
              }
            ]
          },
          kind: 'file',
          oldPath: 'whatever.txt',
          path: __filename,
          stats: modified2.stats
        }
      ])
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should reduce renamed→modified→modified→deleted to renamed→deleted', async () => {
      const renamed = builders
        .event()
        .action('renamed')
        .kind('file')
        .oldPath('whatever.txt')
        .path(__filename)
        .ino(1)
        .build()
      const modified1 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(1)
        .build()
      const modified2 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(2)
        .build()
      const deleted = builders
        .event()
        .action('deleted')
        .kind('file')
        .path(__filename)
        .build()

      const channel = new Channel()
      const originalBatch = [
        renamed,
        modified1,
        modified2,
        deleted,
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          action: 'renamed',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 1st modified -> renamed
                action: 'renamed',
                stats: aggregatedStats(modified1)
              },
              {
                // 1st renamed
                action: 'renamed',
                stats: aggregatedStats(renamed)
              }
            ]
          },
          kind: 'file',
          oldPath: 'whatever.txt',
          path: __filename,
          stats: modified2.stats
        }
      ])
      should(await enhancedChannel.pop()).eql([deleted])
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should not reduce renamed→modified with different inodes', async () => {
      const renamed = builders
        .event()
        .action('renamed')
        .kind('file')
        .oldPath('whatever.txt')
        .path(__filename)
        .ino(1)
        .build()
      const modified = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(2)
        .build()

      const channel = new Channel()
      const originalBatch = [renamed, modified, lastEventToCheckEmptyness]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([renamed])
      should(await enhancedChannel.pop()).eql([modified])
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should reduce modified→modified to latest modified', async () => {
      const modified1 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(1)
        .build()
      const modified2 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(2)
        .build()

      const channel = new Channel()
      const originalBatch = [modified1, modified2, lastEventToCheckEmptyness]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          action: 'modified',
          awaitWriteFinish: {
            previousEvents: [
              {
                action: 'modified',
                stats: aggregatedStats(modified1)
              }
            ]
          },
          kind: 'file',
          path: __filename,
          stats: modified2.stats
        }
      ])
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })

    it('should not squash incomplete events', async () => {
      const created = builders
        .event()
        .action('created')
        .kind('file')
        .path(__filename)
        .ino(1)
        .build()
      const incomplete = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .incomplete()
        .build()
      const modified = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(2)
        .build()

      const channel = new Channel()
      const originalBatch = [
        created,
        incomplete,
        modified,
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        channel.push([Object.assign({}, event)])
      })
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([incomplete])
      should(await enhancedChannel.pop()).eql([
        {
          // 3rd modified -> created
          action: 'created',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 1st created -> created
                action: 'created',
                stats: aggregatedStats(created)
              }
            ]
          },
          kind: 'file',
          path: __filename,
          stats: modified.stats
        }
      ])
      should(await heuristicIsEmpty(enhancedChannel)).be.true()
    })
  })

  context('with one batch', () => {
    it('should reduce created→deleted to empty', async () => {
      const channel = new Channel()
      const originalBatch = [
        builders
          .event()
          .action('created')
          .kind('file')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('deleted')
          .kind('file')
          .path(__filename)
          .build(),
        lastEventToCheckEmptyness
      ]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([lastEventToCheckEmptyness])
    })

    it('should reduce modified→deleted to deleted', async () => {
      const modified = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .build()
      const deleted = builders
        .event()
        .action('deleted')
        .kind('file')
        .path(__filename)
        .deletedIno(1)
        .build()

      const channel = new Channel()
      const originalBatch = [modified, deleted, lastEventToCheckEmptyness]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        deleted,
        lastEventToCheckEmptyness
      ])
    })

    it('should reduce modified→deleted with different inodes to deleted', async () => {
      const modified = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(2)
        .build()
      const deleted = builders
        .event()
        .action('deleted')
        .kind('file')
        .path(__filename)
        .deletedIno(1)
        .build()

      const channel = new Channel()
      const originalBatch = [modified, deleted, lastEventToCheckEmptyness]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        deleted,
        lastEventToCheckEmptyness
      ])
    })

    it('should reduce created→modified→modified to created', async () => {
      const created = builders
        .event()
        .action('created')
        .kind('file')
        .path(__filename)
        .ino(1)
        .build()
      const modified1 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(1)
        .build()
      const modified2 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(2)
        .build()

      const channel = new Channel()
      const originalBatch = [
        created,
        modified1,
        modified2,
        lastEventToCheckEmptyness
      ]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          // 3rd modified -> created
          action: 'created',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 2nd modified -> created
                action: 'created',
                stats: aggregatedStats(modified1)
              },
              {
                // 1st created
                action: 'created',
                stats: aggregatedStats(created)
              }
            ]
          },
          kind: 'file',
          path: __filename,
          stats: modified2.stats
        },
        lastEventToCheckEmptyness
      ])
    })

    it('should reduce created→modified→modified→deleted to empty', async () => {
      const channel = new Channel()
      const originalBatch = [
        builders
          .event()
          .action('created')
          .kind('file')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('modified')
          .kind('file')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('modified')
          .kind('file')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('deleted')
          .kind('file')
          .path(__filename)
          .build(),
        lastEventToCheckEmptyness
      ]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([lastEventToCheckEmptyness])
    })

    it('should reduce renamed→modified→modified to renamed', async () => {
      const renamed = builders
        .event()
        .action('renamed')
        .kind('file')
        .oldPath('whatever.txt')
        .path(__filename)
        .ino(1)
        .build()
      const modified1 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(1)
        .build()
      const modified2 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(2)
        .build()

      const channel = new Channel()
      const originalBatch = [
        renamed,
        modified1,
        modified2,
        lastEventToCheckEmptyness
      ]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          action: 'renamed',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 1st modified
                action: 'renamed',
                stats: aggregatedStats(modified1)
              },
              {
                // renamed
                action: 'renamed',
                stats: aggregatedStats(renamed)
              }
            ]
          },
          kind: 'file',
          oldPath: 'whatever.txt',
          path: __filename,
          stats: modified2.stats
        },
        lastEventToCheckEmptyness
      ])
    })

    it('should reduce renamed→modified→modified→deleted to renamed→deleted', async () => {
      const renamed = builders
        .event()
        .action('renamed')
        .kind('file')
        .oldPath('whatever.txt')
        .path(__filename)
        .ino(1)
        .build()
      const modified1 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(1)
        .build()
      const modified2 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(2)
        .build()
      const deleted = builders
        .event()
        .action('deleted')
        .kind('file')
        .path(__filename)
        .build()

      const channel = new Channel()
      const originalBatch = [
        renamed,
        modified1,
        modified2,
        deleted,
        lastEventToCheckEmptyness
      ]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          action: 'renamed',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 2nd modified -> renamed
                action: 'renamed',
                stats: aggregatedStats(modified1)
              },
              {
                // 1st renamed
                action: 'renamed',
                stats: aggregatedStats(renamed)
              }
            ]
          },
          kind: 'file',
          oldPath: 'whatever.txt',
          path: __filename,
          stats: modified2.stats
        },
        deleted,
        lastEventToCheckEmptyness
      ])
    })

    it('should not reduce renamed→modified with different inodes', async () => {
      const channel = new Channel()
      const originalBatch = [
        builders
          .event()
          .action('renamed')
          .kind('file')
          .oldPath('whatever.txt')
          .path(__filename)
          .ino(1)
          .build(),
        builders
          .event()
          .action('modified')
          .kind('file')
          .path(__filename)
          .ino(2)
          .build(),
        lastEventToCheckEmptyness
      ]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql(originalBatch)
    })

    it('should reduce modified→modified to latest modified', async () => {
      const modified1 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(1)
        .build()
      const modified2 = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(1)
        .size(2)
        .build()

      const channel = new Channel()
      const originalBatch = [modified1, modified2, lastEventToCheckEmptyness]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          action: 'modified',
          awaitWriteFinish: {
            previousEvents: [
              {
                action: 'modified',
                stats: aggregatedStats(modified1)
              }
            ]
          },
          kind: 'file',
          path: __filename,
          stats: modified2.stats
        },
        lastEventToCheckEmptyness
      ])
    })

    it('should not squash incomplete events', async () => {
      const created = builders
        .event()
        .action('created')
        .kind('file')
        .path(__filename)
        .ino(1)
        .build()
      const incomplete = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .incomplete()
        .build()
      const modified = builders
        .event()
        .action('modified')
        .kind('file')
        .path(__filename)
        .ino(2)
        .build()

      const channel = new Channel()
      const originalBatch = [
        created,
        incomplete,
        modified,
        lastEventToCheckEmptyness
      ]
      channel.push(_.cloneDeep(originalBatch))
      const enhancedChannel = awaitWriteFinish.loop(channel, {})
      should(await enhancedChannel.pop()).eql([
        {
          // 3rd modified -> created
          action: 'created',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 1st created
                action: 'created',
                stats: aggregatedStats(created)
              }
            ]
          },
          kind: 'file',
          path: __filename,
          stats: modified.stats
        },
        incomplete,
        lastEventToCheckEmptyness
      ])
    })
  })
})
