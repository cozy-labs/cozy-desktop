/* eslint-env mocha */
/* @flow */

const crypto = require('crypto')

/*::
import type { Stub, Call } from 'sinon'

type DispatchedCalls = {
  [string]: Array<Array<any>>
}
*/

const should = require('should')
const sinon = require('sinon')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

const SyncState = require('../../../../core/syncstate')
const Prep = require('../../../../core/prep')
const Buffer = require('../../../../core/local/steps/buffer')
const dispatch = require('../../../../core/local/steps/dispatch')
const winDetectMove = require('../../../../core/local/steps/win_detect_move')

function dispatchedCalls (obj /*: Stub */) /*: DispatchedCalls */ {
  const methods = Object.getOwnPropertyNames(obj).filter(m => typeof obj[m] === 'function')

  const dispatchedCalls = {}
  for (const method of methods) {
    const calls /*: Array<Call> */ = obj[method].getCalls()

    for (const call of calls) {
      if (!dispatchedCalls[method]) dispatchedCalls[method] = []
      dispatchedCalls[method].push(call.args)
    }
  }

  return dispatchedCalls
}

describe('core/local/steps/dispatch.loop()', function () {
  let builders
  let buffer
  let events
  let prep
  let stepOptions

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('populate pouch with documents', async function () {
    builders = new Builders({pouch: this.pouch})
    buffer = new Buffer()

    events = sinon.createStubInstance(SyncState)
    prep = sinon.createStubInstance(Prep)
    stepOptions = {
      events,
      prep,
      pouch: this.pouch,
      state: await winDetectMove.initialState()
    }
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  context('when buffer contains an initial-scan-done event', () => {
    beforeEach(() => {
      buffer.push([
        builders.event().action('initial-scan-done').build()
      ])
    })

    it('emits an initial-scan-done event via the emitter', async function () {
      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(events)).deepEqual({
        emit: [
          ['initial-scan-done']
        ]
      })
    })

    it('does not call any Prep method', async function () {
      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(prep)).deepEqual({})
    })
  })

  context('when buffer contains an ignored event', () => {
    beforeEach(() => {
      buffer.push([
        builders.event().action('ignored').build()
      ])
    })

    it('does not call any Prep method', async function () {
      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(prep)).deepEqual({})
    })
  })

  context('when buffer contains a scan file event', () => {
    const filePath = 'foo'
    const md5sum = crypto.createHash('md5').update('').digest().toString('base64')

    beforeEach(() => {
      buffer.push([
        builders
          .event()
          .action('scan')
          .kind('file')
          .path(filePath)
          .ino(1)
          .md5sum(md5sum)
          .build()
      ])
    })

    it('triggers a call to addFileAsync with a file Metadata object', async function () {
      const doc = builders.metafile().path(filePath).ino(1).noTags().unmerged('local').build()

      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(prep)).deepEqual({
        addFileAsync: [
          ['local', doc]
        ]
      })
    })
  })

  context('when buffer contains a scan directory event', () => {
    const directoryPath = 'foo'

    beforeEach(() => {
      buffer.push([
        builders.event().action('scan').kind('directory').path(directoryPath).ino(1).build()
      ])
    })

    it('triggers a call to putFolderAsync with a directory Metadata object', async function () {
      const doc = builders.metadir().path(directoryPath).ino(1).noTags().unmerged('local').build()

      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(prep)).deepEqual({
        putFolderAsync: [
          ['local', doc]
        ]
      })
    })
  })

  context('when buffer contains a created file event', () => {
    const filePath = 'foo'
    const md5sum = crypto.createHash('md5').update('').digest().toString('base64')

    beforeEach(() => {
      buffer.push([
        builders
          .event()
          .action('created')
          .kind('file')
          .path(filePath)
          .ino(1)
          .md5sum(md5sum)
          .build()
      ])
    })

    it('triggers a call to addFileAsync with a file Metadata object', async function () {
      const doc = builders.metafile().path(filePath).ino(1).noTags().unmerged('local').build()

      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(prep)).deepEqual({
        addFileAsync: [
          ['local', doc]
        ]
      })
    })
  })

  context('when buffer contains a created directory event', () => {
    const directoryPath = 'foo'

    beforeEach(() => {
      buffer.push([
        builders.event().action('created').kind('directory').path(directoryPath).ino(1).build()
      ])
    })

    it('triggers a call to putFolderAsync with a directory Metadata object', async function () {
      const doc = builders.metadir().path(directoryPath).ino(1).noTags().unmerged('local').build()

      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(prep)).deepEqual({
        putFolderAsync: [
          ['local', doc]
        ]
      })
    })
  })

  context('when buffer contains a modified file event', () => {
    const filePath = 'foo'
    const md5sum = crypto.createHash('md5').update('').digest().toString('base64')

    beforeEach(() => {
      buffer.push([
        builders
          .event()
          .action('modified')
          .kind('file')
          .path(filePath)
          .ino(1)
          .md5sum(md5sum)
          .build()
      ])
    })

    it('triggers a call to updateFileAsync with a file Metadata object', async function () {
      const doc = builders.metafile().path(filePath).ino(1).noTags().unmerged('local').build()

      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(prep)).deepEqual({
        updateFileAsync: [
          ['local', doc]
        ]
      })
    })
  })

  context('when buffer contains a modified directory event', () => {
    const directoryPath = 'foo'

    beforeEach(() => {
      buffer.push([
        builders.event().action('modified').kind('directory').path(directoryPath).ino(1).build()
      ])
    })

    it('triggers a call to putFolderAsync with a directory Metadata object', async function () {
      const doc = builders.metadir().path(directoryPath).ino(1).noTags().unmerged('local').build()

      const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
      await dispatchedBuffer.pop()

      should(dispatchedCalls(prep)).deepEqual({
        putFolderAsync: [
          ['local', doc]
        ]
      })
    })
  })

  context('when buffer contains a renamed file event', () => {
    const filePath = 'foo'
    const newFilePath = 'bar'
    const md5sum = crypto.createHash('md5').update('').digest().toString('base64')

    beforeEach(() => {
      buffer.push([
        builders
          .event()
          .action('renamed')
          .kind('file')
          .oldPath(filePath)
          .path(newFilePath)
          .ino(1)
          .md5sum(md5sum)
          .build()
      ])
    })

    context('with an existing document at the event oldPath', () => {
      let oldDoc

      beforeEach(async () => {
        oldDoc = await builders.metadata().path(filePath).ino(1).create()
      })

      it('triggers a call to moveFileAsync with a file Metadata object', async function () {
        const doc = builders.metafile().path(newFilePath).ino(1).noTags().unmerged('local').build()

        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        await dispatchedBuffer.pop()

        should(dispatchedCalls(prep)).deepEqual({
          moveFileAsync: [
            ['local', doc, oldDoc]
          ]
        })
      })
    })

    context('without existing documents at the event oldPath', () => {
      it('triggers a call to addFileAsync with a file Metadata object', async function () {
        const doc = builders.metafile().path(newFilePath).ino(1).noTags().unmerged('local').build()

        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        await dispatchedBuffer.pop()

        should(dispatchedCalls(prep)).deepEqual({
          addFileAsync: [
            ['local', doc]
          ]
        })
      })

      it('removes the event oldPath', async function () {
        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        const batch = await dispatchedBuffer.pop()

        should(batch).have.length(1)
        should(batch[0]).not.have.property('oldPath')
      })
    })
  })

  context('when buffer contains a renamed directory event', () => {
    const directoryPath = 'foo'
    const newDirectoryPath = 'bar'

    beforeEach(() => {
      buffer.push([
        builders
          .event()
          .action('renamed')
          .kind('directory')
          .oldPath(directoryPath)
          .path(newDirectoryPath)
          .ino(1)
          .build()
      ])
    })

    context('with an existing document at the event oldPath', () => {
      let oldDoc

      beforeEach(async () => {
        oldDoc = await builders.metadata().path(directoryPath).ino(1).create()
      })

      it('triggers a call to moveFolderAsync with a directory Metadata object', async function () {
        const doc = builders.metadir().path(newDirectoryPath).ino(1).noRemote().noTags().build()

        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        await dispatchedBuffer.pop()

        should(dispatchedCalls(prep)).deepEqual({
          moveFolderAsync: [
            ['local', doc, oldDoc]
          ]
        })
      })
    })

    context('without existing documents at the event oldPath', () => {
      it('triggers a call to putFolderAsync with a directory Metadata object', async function () {
        const doc = builders.metadir().path(newDirectoryPath).ino(1).noRemote().noTags().build()

        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        await dispatchedBuffer.pop()

        should(dispatchedCalls(prep)).deepEqual({
          putFolderAsync: [
            ['local', doc]
          ]
        })
      })

      it('removes the event oldPath', async function () {
        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        const batch = await dispatchedBuffer.pop()

        should(batch).have.length(1)
        should(batch[0]).not.have.property('oldPath')
      })
    })
  })

  context('when buffer contains a deleted file event', () => {
    const filePath = 'foo'

    beforeEach(() => {
      buffer.push([
        builders.event().action('deleted').kind('file').path(filePath).ino(1).build()
      ])
    })

    context('with an existing document at the event path', () => {
      let oldDoc

      beforeEach(async () => {
        oldDoc = await builders.metadata().path(filePath).ino(1).create()
      })

      it('triggers a call to trashFileAsync with the existing document', async function () {
        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        await dispatchedBuffer.pop()

        should(dispatchedCalls(prep)).deepEqual({
          trashFileAsync: [
            ['local', oldDoc]
          ]
        })
      })
    })

    context('without existing documents at the event path', () => {
      it('ignores the event', async function () {
        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        await dispatchedBuffer.pop()

        should(dispatchedCalls(prep)).deepEqual({})
      })
    })
  })

  context('when buffer contains a deleted directory event', () => {
    const directoryPath = 'foo'

    beforeEach(() => {
      buffer.push([
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
        oldDoc = await builders.metadata().path(directoryPath).ino(1).create()
      })

      it('triggers a call to trashFolderAsync with the existing document', async function () {
        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        await dispatchedBuffer.pop()

        should(dispatchedCalls(prep)).deepEqual({
          trashFolderAsync: [
            ['local', oldDoc]
          ]
        })
      })
    })

    context('without existing documents at the event path', () => {
      it('ignores the event', async function () {
        const dispatchedBuffer = dispatch.loop(buffer, stepOptions)
        await dispatchedBuffer.pop()

        should(dispatchedCalls(prep)).deepEqual({})
      })
    })
  })
})
