/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')
const sinon = require('sinon')

const { Ignore } = require('../../../../core/ignore')
const Channel = require('../../../../core/local/channel_watcher/channel')
const {
  INITIAL_SCAN_DONE
} = require('../../../../core/local/channel_watcher/event')
const filterIgnored = require('../../../../core/local/channel_watcher/filter_ignored')
const Builders = require('../../../support/builders')
const { onPlatforms } = require('../../../support/helpers/platform')

onPlatforms(['linux', 'win32'], () => {
  describe('core/local/channel_watcher/filter_ignored.loop()', () => {
    const builders = new Builders()

    let channel
    let opts

    beforeEach(() => {
      channel = new Channel()

      const patterns = ['*.bck', 'tmp/', 'folder/']
      opts = {
        ignore: new Ignore(patterns),
        fatal: sinon.spy()
      }
    })

    context('without any batches of events', () => {
      it('does not throw any errors', () => {
        should(() => filterIgnored.loop(channel, opts)).not.throw()
      })
    })

    const ignoredScanEvent = builders
      .event()
      .action('scan')
      .path('ignored.bck')
      .kind('file')
      .build()
    const ignoredCreatedEvent = builders
      .event()
      .action('created')
      .path('tmp/ignored.txt')
      .kind('file')
      .build()
    const ignoredDeletedEvent = builders
      .event()
      .action('deleted')
      .path('tmp/isIgnored.txt')
      .kind('file')
      .build()
    const notIgnoredScanEvent = builders
      .event()
      .action('scan')
      .path('notIgnored.txt')
      .kind('file')
      .build()
    const notIgnoredCreatedEvent = builders
      .event()
      .action('created')
      .path('notIgnored')
      .kind('directory')
      .build()
    const notIgnoredDeletedEvent = builders
      .event()
      .action('deleted')
      .path('data/notIgnored.txt')
      .kind('file')
      .build()
    const ignoredRenamedSrcEvent = builders
      .event()
      .action('renamed')
      .oldPath('tmp/wasIgnored.txt')
      .path('isNotIgnored.txt')
      .kind('file')
      .build()
    const ignoredRenamedDstEvent = builders
      .event()
      .action('renamed')
      .oldPath('wasNotIgnored.txt')
      .path('tmp/isIgnored.txt')
      .kind('file')
      .build()
    const notIgnoredRenamedEvent = builders
      .event()
      .action('renamed')
      .oldPath('notIgnored.txt')
      .path('stillNotIgnored.txt')
      .kind('file')
      .build()

    context('with 1 batch of file & folder events', () => {
      beforeEach(() => {
        channel.push(
          _.cloneDeep([
            notIgnoredScanEvent,
            ignoredScanEvent,
            notIgnoredCreatedEvent,
            ignoredCreatedEvent,
            notIgnoredDeletedEvent,
            ignoredDeletedEvent,
            ignoredRenamedSrcEvent,
            ignoredRenamedDstEvent,
            notIgnoredRenamedEvent,
            INITIAL_SCAN_DONE
          ])
        )
      })

      it('keeps only the relevant events in order', async () => {
        const filteredChannel = filterIgnored.loop(channel, opts)

        const renamedToCreatedEvent = {
          ...ignoredRenamedSrcEvent,
          action: 'created',
          [filterIgnored.STEP_NAME]: {
            movedFromIgnoredPath: ignoredRenamedSrcEvent.oldPath
          }
        }
        delete renamedToCreatedEvent.oldPath
        const renamedToDeletedEvent = {
          ...ignoredRenamedDstEvent,
          action: 'deleted',
          path: ignoredRenamedDstEvent.oldPath,
          [filterIgnored.STEP_NAME]: {
            movedToIgnoredPath: ignoredRenamedDstEvent.path
          }
        }
        delete renamedToDeletedEvent.oldPath
        const relevantEvents = await filteredChannel.pop()
        should(relevantEvents).deepEqual([
          notIgnoredScanEvent,
          notIgnoredCreatedEvent,
          notIgnoredDeletedEvent,
          renamedToCreatedEvent,
          renamedToDeletedEvent,
          notIgnoredRenamedEvent,
          INITIAL_SCAN_DONE
        ])
      })
    })

    context('with multiple batches of file & folder events', () => {
      beforeEach(() => {
        channel.push(_.cloneDeep([notIgnoredScanEvent, ignoredScanEvent]))
        channel.push(_.cloneDeep([notIgnoredCreatedEvent, ignoredCreatedEvent]))
        channel.push(_.cloneDeep([notIgnoredDeletedEvent, ignoredDeletedEvent]))
        channel.push(
          _.cloneDeep([ignoredRenamedSrcEvent, ignoredRenamedDstEvent])
        )
        channel.push(_.cloneDeep([notIgnoredRenamedEvent, INITIAL_SCAN_DONE]))
      })

      it('returns a channel with only the relevant events in order', async () => {
        const filteredChannel = filterIgnored.loop(channel, opts)

        const renamedToCreatedEvent = {
          ...ignoredRenamedSrcEvent,
          action: 'created',
          [filterIgnored.STEP_NAME]: {
            movedFromIgnoredPath: ignoredRenamedSrcEvent.oldPath
          }
        }
        delete renamedToCreatedEvent.oldPath
        const renamedToDeletedEvent = {
          ...ignoredRenamedDstEvent,
          action: 'deleted',
          path: ignoredRenamedDstEvent.oldPath,
          [filterIgnored.STEP_NAME]: {
            movedToIgnoredPath: ignoredRenamedDstEvent.path
          }
        }
        delete renamedToDeletedEvent.oldPath
        should(await filteredChannel.pop()).deepEqual([notIgnoredScanEvent])
        should(await filteredChannel.pop()).deepEqual([notIgnoredCreatedEvent])
        should(await filteredChannel.pop()).deepEqual([notIgnoredDeletedEvent])
        should(await filteredChannel.pop()).deepEqual([
          renamedToCreatedEvent,
          renamedToDeletedEvent
        ])
        should(await filteredChannel.pop()).deepEqual([
          notIgnoredRenamedEvent,
          INITIAL_SCAN_DONE
        ])
      })
    })

    context('with file events matching folder patterns', () => {
      const directoryScanEvent = builders
        .event()
        .action('scan')
        .path('folder')
        .kind('directory')
        .build()
      const fileScanEvent = builders
        .event()
        .action('scan')
        .path('folder')
        .kind('file')
        .build()
      beforeEach(() => {
        channel.push([directoryScanEvent, fileScanEvent])
      })

      it('filters out folder events only', async () => {
        const filteredChannel = filterIgnored.loop(channel, opts)

        const relevantEvents = await filteredChannel.pop()
        should(relevantEvents).deepEqual([fileScanEvent])
      })
    })
  })
})
