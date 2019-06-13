/* eslint-env mocha */
/* @flow */

const should = require('should')
const _ = require('lodash')

const { onPlatforms } = require('../../../support/helpers/platform')
const Builders = require('../../../support/builders')

const { Ignore } = require('../../../../core/ignore')
const metadata = require('../../../../core/metadata')
const { INITIAL_SCAN_DONE } = require('../../../../core/local/atom/event')
const Channel = require('../../../../core/local/atom/channel')
const filterIgnored = require('../../../../core/local/atom/filter_ignored')

onPlatforms(['linux', 'win32'], () => {
  describe('core/local/atom/filter_ignored.loop()', () => {
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
        const filteredChannel = filterIgnored.loop(channel, { ignore })

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
          // $FlowFixMe ignoredRenamedDstEvent does have an oldPath attribute
          _id: metadata.id(ignoredRenamedDstEvent.oldPath),
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
        const filteredChannel = filterIgnored.loop(channel, { ignore })

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
          // $FlowFixMe ignoredRenamedDstEvent does have an oldPath attribute
          _id: metadata.id(ignoredRenamedDstEvent.oldPath),
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
        const filteredChannel = filterIgnored.loop(channel, { ignore })

        const relevantEvents = await filteredChannel.pop()
        should(relevantEvents).deepEqual([fileScanEvent])
      })
    })
  })
})
