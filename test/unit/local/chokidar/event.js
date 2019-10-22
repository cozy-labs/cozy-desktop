/* eslint-env mocha */
/* @flow */

const faker = require('faker')
const should = require('should')

const chokidarEvent = require('../../../../core/local/chokidar/event')
const stater = require('../../../../core/local/stater')
const { onPlatform } = require('../../../support/helpers/platform')

onPlatform('darwin', () => {
  describe('core/local/chokidar/event', () => {
    describe('build', () => {
      let path, fileStats, dirStats

      before(async () => {
        path = faker.system.fileName()
        fileStats = await stater.stat(__filename)
        dirStats = await stater.stat(__dirname)
      })

      it('builds an FS event with path and stats', () => {
        for (let type of ['add', 'change']) {
          const event = chokidarEvent.build(type, path, fileStats)
          should(event).deepEqual({ type, path, stats: fileStats })
        }
        const event = chokidarEvent.build('addDir', path, dirStats)
        should(event).deepEqual({ type: 'addDir', path, stats: dirStats })
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
        const changeEvent = chokidarEvent.build('change', '', fileStats)
        should(changeEvent).deepEqual({
          type: 'change',
          path: '',
          stats: fileStats
        })
        const addDirEvent = chokidarEvent.build('addDir', '', dirStats)
        should(addDirEvent).deepEqual({
          type: 'addDir',
          path: '',
          stats: dirStats
        })
      })

      it('fixes incorrect event types based on stats', () => {
        const addEvent = chokidarEvent.build('add', path, dirStats)
        should(addEvent).deepEqual({
          type: 'addDir',
          path,
          stats: dirStats
        })
        const addDirEvent = chokidarEvent.build('addDir', path, fileStats)
        should(addDirEvent).deepEqual({
          type: 'add',
          path,
          stats: fileStats
        })
      })
    })
  })
})
