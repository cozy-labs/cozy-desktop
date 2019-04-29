/* eslint-env mocha */
/* @flow */

const faker = require('faker')
const fs = require('fs')
const should = require('should')

const chokidarEvent = require('../../../core/local/chokidar_event')

describe('local/chokidar_event', () => {
  describe('build', () => {
    let path, stats

    before(() => {
      path = faker.system.fileName()
      stats = new fs.Stats()
    })

    it('builds an FS event with path and stats', () => {
      for (let type of ['add', 'addDir', 'change']) {
        const event = chokidarEvent.build(type, path, stats)
        should(event).deepEqual({ type, path, stats })
      }
    })

    it('builds an FS event with path only', () => {
      for (let type of ['unlink', 'unlinkDir']) {
        const event = chokidarEvent.build(type, path)
        should(event).deepEqual({ type, path })
      }
    })

    it('builds a ready event', () => {
      const type = 'ready'
      const event = chokidarEvent.build(type)
      should(event).deepEqual({ type })
    })

    it('does not swallow the empty path of the watched dir', () => {
      for (let type of ['addDir', 'change']) {
        const event = chokidarEvent.build(type, '', stats)
        should(event).deepEqual({ type, path: '', stats })
      }
    })
  })
})
