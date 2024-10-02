/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')
const path = require('path')

const configHelpers = require('../../../support/helpers/config')
const { onPlatforms } = require('../../../support/helpers/platform')

const checksumer = require('../../../../core/local/checksumer')
const addChecksum = require('../../../../core/local/channel_watcher/add_checksum')
const Channel = require('../../../../core/local/channel_watcher/channel')

onPlatforms(['linux', 'win32'], () => {
  describe('core/local/channel_watcher/add_checksum.loop()', () => {
    let dirpath, filepath, opts
    before(configHelpers.createConfig)
    before(function () {
      dirpath = path.basename(__dirname)
      filepath = path.join(dirpath, path.basename(__filename))

      const config = this.config
      config.syncPath = path.dirname(__dirname)
      opts = { config, checksumer: checksumer.init(), fatal: sinon.spy() }
    })

    it('should add checksum within a file event', async () => {
      const batch = [
        {
          action: 'scan',
          kind: 'file',
          path: filepath
        }
      ]
      const channel = new Channel()
      channel.push(batch)
      const enhancedChannel = addChecksum.loop(channel, opts)
      const enhancedBatch = await enhancedChannel.pop()
      should(enhancedBatch).be.an.Array().and.length(batch.length)
      should.exist(enhancedBatch[0].md5sum)
    })

    it('should not add checksum within a not file event', async () => {
      const batch = [
        {
          action: 'scan',
          kind: 'directory',
          path: dirpath
        }
      ]
      const channel = new Channel()
      channel.push(batch)
      const enhancedChannel = addChecksum.loop(channel, opts)
      const enhancedBatch = await enhancedChannel.pop()
      should(enhancedBatch).be.an.Array().and.length(batch.length)
      should.not.exist(enhancedBatch[0].md5sum)
    })

    it('should not compute checksum if already present', async () => {
      const batch = [
        {
          action: 'scan',
          kind: 'file',
          path: filepath,
          md5sum: 'checksum'
        }
      ]
      const channel = new Channel()
      channel.push(batch)
      const enhancedChannel = addChecksum.loop(channel, opts)
      const enhancedBatch = await enhancedChannel.pop()
      should(enhancedBatch).be.an.Array().and.length(batch.length)
      should(enhancedBatch[0]).have.property('md5sum', 'checksum')
    })

    it('should work for every action except ignored', async () => {
      const checksum = await checksumer.computeChecksumAsync(__filename)
      const createdEvent = {
        action: 'created',
        kind: 'file',
        path: filepath
      }
      const modifiedEvent = {
        action: 'modified',
        kind: 'file',
        path: filepath
      }
      const scanEvent = {
        action: 'scan',
        kind: 'file',
        path: filepath
      }
      const renamedEvent = {
        action: 'renamed',
        kind: 'file',
        path: filepath
      }
      const ignoredEvent = {
        action: 'ignored',
        kind: 'file',
        path: filepath
      }
      const channel = new Channel()
      channel.push([
        createdEvent,
        modifiedEvent,
        scanEvent,
        renamedEvent,
        ignoredEvent
      ])
      const enhancedChannel = addChecksum.loop(channel, opts)
      const enhancedBatch = await enhancedChannel.pop()
      should(enhancedBatch).deepEqual([
        {
          ...createdEvent,
          md5sum: checksum
        },
        {
          ...modifiedEvent,
          md5sum: checksum
        },
        {
          ...scanEvent,
          md5sum: checksum
        },
        {
          ...renamedEvent,
          md5sum: checksum
        },
        ignoredEvent
      ])
    })
  })
})
