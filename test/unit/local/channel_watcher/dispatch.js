/* eslint-env mocha */
/* @flow */

/*::
import type { Stub, Call } from 'sinon'

type DispatchedCalls = {
  [string]: Array<Array<any>>
}
*/

const should = require('should')
const sinon = require('sinon')
const _ = require('lodash')
const { Promise } = require('bluebird')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

const SyncState = require('../../../../core/syncstate')
const Prep = require('../../../../core/prep')
const Channel = require('../../../../core/local/channel_watcher/channel')
const dispatch = require('../../../../core/local/channel_watcher/dispatch')
const winDetectMove = require('../../../../core/local/channel_watcher/win_detect_move')

function dispatchedCalls(obj /*: Stub */) /*: DispatchedCalls */ {
  const methods = Object.getOwnPropertyNames(obj).filter(
    m => typeof obj[m] === 'function'
  )

  const dispatchedCalls = {}
  for (const method of methods) {
    const calls /*: Array<Call> */ = obj[method].getCalls()

    for (const call of calls) {
      if (!dispatchedCalls[method]) dispatchedCalls[method] = []

      // XXX: buildFile & buildDir always add the `remote` attribute even when
      // it's not defined.
      // Metadata builders won't add it though and changing the implementation
      // will mean a lot of tests to update so we simply remove the attribute
      // if it's undefined to match the builders data.
      const doc = call.args[1]
      if (doc && doc.remote == undefined) delete doc.remote
      dispatchedCalls[method].push(call.args)
    }
  }

  return dispatchedCalls
}

describe('core/local/channel_watcher/dispatch.loop()', function () {
  let builders
  let channel
  let events
  let prep
  let stepOptions

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('populate pouch with documents', async function () {
    builders = new Builders({ pouch: this.pouch })
    channel = new Channel()

    events = sinon.createStubInstance(SyncState)
    prep = sinon.createStubInstance(Prep)
    stepOptions = {
      config: this.config,
      events,
      prep,
      pouch: this.pouch,
      state: {
        ...(await dispatch.initialState()),
        ...(await winDetectMove.initialState())
      }
    }
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  context('when channel contains an initial-scan-done event', () => {
    beforeEach(() => {
      channel.push([builders.event().action('initial-scan-done').build()])
    })

    it('emits an initial-scan-done event via the emitter', async function () {
      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(events)).containDeep({
        emit: [['initial-scan-done']]
      })
    })

    it('does not emit a sync-target event via the emitter', async function () {
      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(events)).not.containDeep({
        emit: [['sync-target']]
      })
    })

    it('does not call any Prep method', async function () {
      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(prep)).deepEqual({})
    })
  })

  context('when channel contains an ignored event', () => {
    beforeEach(() => {
      channel.push([builders.event().action('ignored').build()])
    })

    it('does not call any Prep method', async function () {
      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(prep)).deepEqual({})
    })

    it('does not emit a sync-target event via the emitter', async function () {
      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(events)).not.containDeep({
        emit: [['sync-target']]
      })
    })
  })

  context('when channel contains non-ignored change events', () => {
    let changeEvents
    beforeEach(() => {
      changeEvents = [
        builders.event().action('created').kind('file').build(),
        builders.event().action('created').kind('file').build(),
        builders.event().action('ignored').kind('file').build(), // No events for this one
        builders.event().action('created').kind('file').build(),
        builders.event().action('created').kind('file').build()
      ]
      channel.push(changeEvents)
    })

    it('emits sync-target events via the emitter', async function () {
      await dispatch.loop(channel, stepOptions).pop()

      // Make sure we emit exactly 4 sync-target events, one for each
      // non-ignored event.
      should(dispatchedCalls(events))
        .containDeep({
          emit: [
            ['sync-target'],
            ['sync-target'],
            ['sync-target'],
            ['sync-target']
          ]
        })
        .and.not.containDeep({
          emit: [
            ['sync-target'],
            ['sync-target'],
            ['sync-target'],
            ['sync-target'],
            ['sync-target']
          ]
        })
    })
  })

  context('when channel contains multiple batches', () => {
    context('processed in less than a second', () => {
      it('emits a local-start event for each batch via the emitter', async function () {
        const outChannel = dispatch.loop(channel, stepOptions)

        channel.push([builders.event().build()])
        await outChannel.pop()
        channel.push([builders.event().build()])
        await outChannel.pop()

        should(dispatchedCalls(events)).containDeep({
          emit: [['local-start'], ['local-start']]
        })
      })

      it('emits only one local-end event via the emitter', async function () {
        const outChannel = dispatch.loop(channel, stepOptions)

        channel.push([builders.event().build()])
        await outChannel.pop()
        channel.push([builders.event().build()])
        await outChannel.pop()
        // Wait for the local-end event
        await Promise.delay(dispatch.LOCAL_END_NOTIFICATION_DELAY)

        // Not two
        should(dispatchedCalls(events)).not.containDeep({
          emit: [['local-end'], ['local-end']]
        })
        // Just one
        should(dispatchedCalls(events)).containDeep({
          emit: [['local-end']]
        })
      })
    })

    context('processed in more than a second', () => {
      it('emits a local-start event for each batch via the emitter', async function () {
        const outChannel = dispatch.loop(channel, stepOptions)

        channel.push([builders.event().build()])
        await outChannel.pop()
        //
        // Wait for the local-end event
        await Promise.delay(dispatch.LOCAL_END_NOTIFICATION_DELAY)

        channel.push([builders.event().build()])
        await outChannel.pop()

        should(dispatchedCalls(events)).containDeep({
          emit: [['local-start'], ['local-start']]
        })
      })

      it('emits one local-end event for each batch via the emitter', async function () {
        const outChannel = dispatch.loop(channel, stepOptions)

        channel.push([builders.event().build()])
        await outChannel.pop()

        // Wait for the local-end event
        await Promise.delay(dispatch.LOCAL_END_NOTIFICATION_DELAY)

        channel.push([builders.event().build()])
        await outChannel.pop()
        // Wait for the local-end event
        await Promise.delay(dispatch.LOCAL_END_NOTIFICATION_DELAY)

        should(dispatchedCalls(events)).containDeep({
          emit: [['local-end'], ['local-end']]
        })
      })
    })
  })

  context('when channel contains a scan file event', () => {
    const filePath = 'foo'
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('scan')
          .kind('file')
          .path(filePath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(1)
          .data('')
          .build()
      ])
    })

    it('triggers a call to addFileAsync with a file Metadata object', async function () {
      const doc = builders
        .metafile()
        .path(filePath)
        .updatedAt(updatedAt)
        .ino(1)
        .noTags()
        .unmerged('local')
        .build()

      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(prep)).deepEqual({
        addFileAsync: [
          [
            'local',
            _.defaultsDeep(
              {
                local: { updated_at: updatedAt.toISOString() }
              },
              doc
            )
          ]
        ]
      })
    })
  })

  context('when channel contains a scan directory event', () => {
    const directoryPath = 'foo'
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('scan')
          .kind('directory')
          .path(directoryPath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(1)
          .build()
      ])
    })

    it('triggers a call to putFolderAsync with a directory Metadata object', async function () {
      const doc = builders
        .metadir()
        .path(directoryPath)
        .updatedAt(updatedAt)
        .ino(1)
        .noTags()
        .unmerged('local')
        .build()

      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(prep)).deepEqual({
        putFolderAsync: [['local', doc]]
      })
    })
  })

  context('when channel contains a created file event', () => {
    const filePath = 'foo'
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('created')
          .kind('file')
          .path(filePath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(1)
          .data('')
          .build()
      ])
    })

    it('triggers a call to addFileAsync with a file Metadata object', async function () {
      const doc = builders
        .metafile()
        .path(filePath)
        .updatedAt(updatedAt)
        .ino(1)
        .noTags()
        .unmerged('local')
        .build()

      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(prep)).deepEqual({
        addFileAsync: [
          [
            'local',
            _.defaultsDeep(
              {
                local: { updated_at: updatedAt.toISOString() }
              },
              doc
            )
          ]
        ]
      })
    })
  })

  context('when channel contains a created directory event', () => {
    const directoryPath = 'foo'
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('created')
          .kind('directory')
          .path(directoryPath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(1)
          .build()
      ])
    })

    it('triggers a call to putFolderAsync with a directory Metadata object', async function () {
      const doc = builders
        .metadir()
        .path(directoryPath)
        .updatedAt(updatedAt)
        .ino(1)
        .noTags()
        .unmerged('local')
        .build()

      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(prep)).deepEqual({
        putFolderAsync: [['local', doc]]
      })
    })
  })

  context('when channel contains a modified file event', () => {
    const filePath = 'foo'
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('modified')
          .kind('file')
          .path(filePath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(1)
          .data('')
          .build()
      ])
    })

    it('triggers a call to updateFileAsync with a file Metadata object', async function () {
      const doc = builders
        .metafile()
        .path(filePath)
        .updatedAt(updatedAt)
        .ino(1)
        .noTags()
        .unmerged('local')
        .build()

      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(prep)).deepEqual({
        updateFileAsync: [
          [
            'local',
            _.defaultsDeep(
              {
                local: { updated_at: updatedAt.toISOString() }
              },
              doc
            )
          ]
        ]
      })
    })
  })

  context('when channel contains a modified directory event', () => {
    const directoryPath = 'foo'
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('modified')
          .kind('directory')
          .path(directoryPath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(1)
          .build()
      ])
    })

    it('triggers a call to putFolderAsync with a directory Metadata object', async function () {
      const doc = builders
        .metadir()
        .path(directoryPath)
        .updatedAt(updatedAt)
        .ino(1)
        .noTags()
        .unmerged('local')
        .build()

      await dispatch.loop(channel, stepOptions).pop()

      should(dispatchedCalls(prep)).deepEqual({
        putFolderAsync: [['local', doc]]
      })
    })
  })

  context('when channel contains a renamed file event', () => {
    const filePath = 'foo'
    const newFilePath = 'bar'
    const fileIno = 1
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('renamed')
          .kind('file')
          .oldPath(filePath)
          .path(newFilePath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(fileIno)
          .data('')
          .build()
      ])
    })

    context('with an existing document at the event oldPath', () => {
      context('and the inodes match', () => {
        let oldDoc

        beforeEach(async () => {
          oldDoc = await builders
            .metafile()
            .path(filePath)
            .ino(fileIno)
            .upToDate()
            .create()
        })

        it('triggers a call to moveFileAsync with a file Metadata object', async function () {
          const doc = builders
            .metafile()
            .path(newFilePath)
            .updatedAt(updatedAt)
            .ino(1)
            .noTags()
            .unmerged('local')
            .build()

          await dispatch.loop(channel, stepOptions).pop()

          should(dispatchedCalls(prep)).deepEqual({
            moveFileAsync: [
              [
                'local',
                _.defaultsDeep(
                  {
                    local: { updated_at: updatedAt.toISOString() }
                  },
                  doc
                ),
                oldDoc
              ]
            ]
          })
        })
      })

      context('but the inodes do not match', () => {
        beforeEach(async () => {
          await builders
            .metafile()
            .path(filePath)
            .ino(fileIno + 1)
            .upToDate()
            .create()
        })

        it('does not call moveFileAsync', async function () {
          await dispatch.loop(channel, stepOptions).pop()

          should(dispatchedCalls(prep)).deepEqual({})
        })
      })
    })

    context('for a propagated remote move', () => {
      beforeEach('build records for moved doc', async function () {
        const src = await builders
          .metafile()
          .path(filePath)
          .ino(1)
          .upToDate()
          .create()

        const dst = await builders
          .metafile()
          .moveFrom(src)
          .path(newFilePath)
          .updatedAt(updatedAt)
          .upToDate()
          .create()
        // Simulate Sync removing the moveFrom attribute after propagating the
        // remote move.
        delete dst.moveFrom
        this.pouch.put(dst)
      })

      it('does not trigger any call to prep', async function () {
        await dispatch.loop(channel, stepOptions).pop()

        should(dispatchedCalls(prep)).deepEqual({})
      })
    })
  })

  context('when channel contains a overwriting renamed file event', () => {
    const filePath = 'foo'
    const newFilePath = 'bar'
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('renamed')
          .kind('file')
          .oldPath(filePath)
          .path(newFilePath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(1)
          .data('')
          .overwrite()
          .build()
      ])
    })

    context('with an existing document at the event oldPath', () => {
      let oldDoc

      beforeEach(async () => {
        oldDoc = await builders
          .metafile()
          .path(filePath)
          .ino(1)
          .upToDate()
          .create()
      })

      context('and overwriting an existing document at the event path', () => {
        let existingDoc

        beforeEach(async () => {
          existingDoc = await builders
            .metafile()
            .path(newFilePath)
            .ino(2)
            .upToDate()
            .create()
        })

        it('triggers a call to moveFileAsync with an overwriting file Metadata object', async function () {
          const doc = builders
            .metafile()
            .path(newFilePath)
            .updatedAt(updatedAt)
            .ino(1)
            .noTags()
            .unmerged('local')
            .build()

          await dispatch.loop(channel, stepOptions).pop()

          should(dispatchedCalls(prep)).deepEqual({
            moveFileAsync: [
              [
                'local',
                _.defaultsDeep(
                  {
                    overwrite: existingDoc,
                    local: { updated_at: updatedAt.toISOString() }
                  },
                  doc
                ),
                oldDoc
              ]
            ]
          })
        })
      })
    })

    context('without existing documents at the event oldPath', () => {
      it('triggers a call to addFileAsync with a file Metadata object', async function () {
        const doc = builders
          .metafile()
          .path(newFilePath)
          .updatedAt(updatedAt)
          .ino(1)
          .noTags()
          .unmerged('local')
          .build()

        await dispatch.loop(channel, stepOptions).pop()

        should(dispatchedCalls(prep)).deepEqual({
          addFileAsync: [
            [
              'local',
              _.defaultsDeep(
                { local: { updated_at: updatedAt.toISOString() } },
                doc
              )
            ]
          ]
        })
      })

      it('removes the event oldPath', async function () {
        const batch = await dispatch.loop(channel, stepOptions).pop()

        should(batch).have.length(1)
        should(batch[0]).not.have.property('oldPath')
      })
    })
  })

  context('when channel contains a renamed directory event', () => {
    const directoryPath = 'foo'
    const newDirectoryPath = 'bar'
    const dirIno = 1
    const updatedAt = new Date()

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('renamed')
          .kind('directory')
          .oldPath(directoryPath)
          .path(newDirectoryPath)
          .mtime(updatedAt)
          .ctime(updatedAt)
          .ino(dirIno)
          .build()
      ])
    })

    context('with an existing document at the event oldPath', () => {
      context('and the inodes match', () => {
        let oldDoc

        beforeEach(async () => {
          oldDoc = await builders
            .metadir()
            .path(directoryPath)
            .ino(dirIno)
            .upToDate()
            .create()
        })

        it('triggers a call to moveFolderAsync with a directory Metadata object', async function () {
          const doc = builders
            .metadir()
            .path(newDirectoryPath)
            .updatedAt(updatedAt)
            .ino(1)
            .noTags()
            .unmerged('local')
            .build()

          await dispatch.loop(channel, stepOptions).pop()

          should(dispatchedCalls(prep)).deepEqual({
            moveFolderAsync: [['local', doc, oldDoc]]
          })
        })
      })

      context('and the inodes do not match', () => {
        beforeEach(async () => {
          await builders
            .metadir()
            .path(directoryPath)
            .ino(dirIno + 1)
            .upToDate()
            .create()
        })

        it('does not call moveFolderAsync', async function () {
          await dispatch.loop(channel, stepOptions).pop()

          should(dispatchedCalls(prep)).deepEqual({})
        })
      })
    })

    context('without existing documents at the event oldPath', () => {
      it('triggers a call to putFolderAsync with a directory Metadata object', async function () {
        const doc = builders
          .metadir()
          .path(newDirectoryPath)
          .updatedAt(updatedAt)
          .ino(1)
          .noTags()
          .unmerged('local')
          .build()

        await dispatch.loop(channel, stepOptions).pop()

        should(dispatchedCalls(prep)).deepEqual({
          putFolderAsync: [['local', doc]]
        })
      })

      it('removes the event oldPath', async function () {
        const batch = await dispatch.loop(channel, stepOptions).pop()

        should(batch).have.length(1)
        should(batch[0]).not.have.property('oldPath')
      })
    })

    context('for a propagated remote move', () => {
      beforeEach('build records for moved doc', async function () {
        const src = await builders
          .metadir()
          .path(directoryPath)
          .ino(1)
          .upToDate()
          .create()

        const dst = await builders
          .metadir()
          .moveFrom(src)
          .path(newDirectoryPath)
          .updatedAt(updatedAt)
          .upToDate()
          .create()
        // Simulate Sync removing the moveFrom attribute after propagating the
        // remote move.
        delete dst.moveFrom
        this.pouch.put(dst)
      })

      it('does not trigger any call to prep', async function () {
        await dispatch.loop(channel, stepOptions).pop()

        should(dispatchedCalls(prep)).deepEqual({})
      })
    })
  })

  context('when channel contains a deleted file event', () => {
    const filePath = 'foo'

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('deleted')
          .kind('file')
          .path(filePath)
          .ino(1)
          .build()
      ])
    })

    context('with an existing document at the event path', () => {
      let oldDoc

      beforeEach(async () => {
        oldDoc = await builders
          .metafile()
          .path(filePath)
          .ino(1)
          .upToDate()
          .create()
      })

      it('triggers a call to trashFileAsync with the existing document', async function () {
        await dispatch.loop(channel, stepOptions).pop()

        should(dispatchedCalls(prep)).deepEqual({
          trashFileAsync: [['local', oldDoc]]
        })
      })
    })

    context('without existing documents at the event path', () => {
      it('ignores the event', async function () {
        await dispatch.loop(channel, stepOptions).pop()

        should(dispatchedCalls(prep)).deepEqual({})
      })
    })
  })

  context('when channel contains a deleted directory event', () => {
    const directoryPath = 'foo'

    beforeEach(() => {
      channel.push([
        builders
          .event()
          .action('deleted')
          .kind('directory')
          .path(directoryPath)
          .ino(1)
          .build()
      ])
    })

    context('with an existing document at the event path', () => {
      let oldDoc

      beforeEach(async () => {
        oldDoc = await builders
          .metadir()
          .path(directoryPath)
          .ino(1)
          .upToDate()
          .create()
      })

      it('triggers a call to trashFolderAsync with the existing document', async function () {
        await dispatch.loop(channel, stepOptions).pop()

        should(dispatchedCalls(prep)).deepEqual({
          trashFolderAsync: [['local', oldDoc]]
        })
      })
    })

    context('without existing documents at the event path', () => {
      it('ignores the event', async function () {
        await dispatch.loop(channel, stepOptions).pop()

        should(dispatchedCalls(prep)).deepEqual({})
      })
    })
  })
})
