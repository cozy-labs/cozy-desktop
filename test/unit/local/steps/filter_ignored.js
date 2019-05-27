/* eslint-env mocha */
/* @flow */

const should = require('should')
const { onPlatforms } = require('../../../support/helpers/platform')
const Builders = require('../../../support/builders')

const { Ignore } = require('../../../../core/ignore')
const Channel = require('../../../../core/local/steps/channel')
const filterIgnored = require('../../../../core/local/steps/filter_ignored')

onPlatforms(['linux', 'win32'], () => {
  describe('local/steps/filter_ignored.loop()', () => {
    const builders = new Builders()

    let ignore
    let channel

    beforeEach(() => {
      channel = new Channel()

      const patterns = ['*.bck', 'tmp/', 'folder/']
      ignore = new Ignore(patterns)
    })

    context('without any batches of events', () => {
      it('does not throw any errors', () => {
        should(() => filterIgnored.loop(channel, { ignore })).not.throw()
      })
    })

    context('with 1 batch of file & folder events', () => {
      const ignoredEvents = [
        builders
          .event()
          .path('ignored.bck')
          .kind('file')
          .build(),
        builders
          .event()
          .path('tmp/ignored.txt')
          .kind('file')
          .build()
      ]
      const notIgnoredEvents = [
        builders
          .event()
          .action('initial-scan-done')
          .path('.')
          .kind('unknown')
          .noIgnore()
          .build(),
        builders
          .event()
          .path('notIgnored.txt')
          .kind('file')
          .build(),
        builders
          .event()
          .path('notIgnored')
          .kind('directory')
          .build(),
        builders
          .event()
          .path('data/notIgnored.txt')
          .kind('file')
          .build()
      ]
      beforeEach(() => {
        // Mix ignored and not ignored events
        let batch = []
        for (
          let i = 0;
          i < Math.max(ignoredEvents.length, notIgnoredEvents.length);
          i++
        ) {
          if (notIgnoredEvents[i]) {
            batch.push(notIgnoredEvents[i])
          }
          if (ignoredEvents[i]) {
            batch.push(ignoredEvents[i])
          }
        }
        channel.push(batch)
      })

      it('keeps only the relevant events in order', async () => {
        const filteredChannel = filterIgnored.loop(channel, { ignore })

        const relevantEvents = await filteredChannel.pop()
        should(relevantEvents).deepEqual(notIgnoredEvents)
      })
    })

    context('with multiple batches of file & folder events', () => {
      const ignoredEvents = [
        builders
          .event()
          .path('ignored1.bck')
          .kind('file')
          .build(),
        builders
          .event()
          .path('ignored2.bck')
          .kind('file')
          .build()
      ]
      const notIgnoredEvents = [
        builders
          .event()
          .path('notIgnored1.txt')
          .kind('file')
          .build(),
        builders
          .event()
          .path('notIgnored2.txt')
          .kind('file')
          .build()
      ]
      beforeEach(() => {
        channel.push([ignoredEvents[0], notIgnoredEvents[0]])
        channel.push([ignoredEvents[1], notIgnoredEvents[1]])
      })

      it('returns a channel without events for filtered paths', async () => {
        let relevantEvents

        const filteredChannel = filterIgnored.loop(channel, { ignore })

        relevantEvents = await filteredChannel.pop()
        should(relevantEvents).not.containDeep(ignoredEvents)
        relevantEvents = await filteredChannel.pop()
        should(relevantEvents).not.containDeep(ignoredEvents)
      })

      it('keeps the order of batches with relevant events', async () => {
        let relevantEvents

        const filteredChannel = filterIgnored.loop(channel, { ignore })

        relevantEvents = await filteredChannel.pop()
        should(relevantEvents).containDeepOrdered([notIgnoredEvents[0]])
        relevantEvents = await filteredChannel.pop()
        should(relevantEvents).containDeepOrdered([notIgnoredEvents[1]])
      })
    })

    context('with file events matching folder patterns', () => {
      const directoryEvent = builders
        .event()
        .path('folder')
        .kind('directory')
        .build()
      const fileEvent = builders
        .event()
        .path('folder')
        .kind('file')
        .build()
      beforeEach(() => {
        channel.push([directoryEvent, fileEvent])
      })

      it('filters out folder events only', async () => {
        const filteredChannel = filterIgnored.loop(channel, { ignore })

        const relevantEvents = await filteredChannel.pop()
        should(relevantEvents).deepEqual([fileEvent])
      })
    })
  })
})
