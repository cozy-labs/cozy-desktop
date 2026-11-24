/* eslint-env mocha */

const path = require('path')

const fse = require('fs-extra')
const should = require('should')
const sinon = require('sinon')

const prepareEvents = require('../../../../core/local/chokidar/prepare_events')
const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const { onPlatform } = require('../../../support/helpers/platform')
const pouchHelpers = require('../../../support/helpers/pouch')

onPlatform('darwin', () => {
  describe('core/local/chokidar_steps/prepare_events', () => {
    let builders

    before('instanciate config', configHelpers.createConfig)
    before('instanciate pouch', pouchHelpers.createDatabase)
    beforeEach('set up builders', function() {
      builders = new Builders(this)
    })

    after('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    describe('#oldMetadata()', () => {
      it('resolves with the metadata whose id matches the event path', async function() {
        const old = await builders
          .metadata()
          .upToDate()
          .create()
        const resultByEventType = {}
        for (let type of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
          resultByEventType[type] = await prepareEvents.oldMetadata(
            {
              type,
              path: old.path
            },
            this.pouch
          )
        }
        should(resultByEventType).deepEqual({
          add: old,
          addDir: old,
          change: old,
          unlink: old,
          unlinkDir: old
        })
      })
    })

    describe('#step()', () => {
      it('does not compute checksum of untouched file', async function() {
        const untouched = await builders
          .metafile()
          .path('untouched')
          .data('initial')
          .upToDate()
          .create()
        const sameContent = await builders
          .metafile()
          .path('sameContent')
          .data('initial')
          .upToDate()
          .create()
        const events /*: ChokidarEvent[] */ = [
          {
            type: 'add',
            path: untouched.path,
            old: untouched,
            stats: {
              mtime: new Date(untouched.updated_at)
            }
          },
          {
            type: 'change',
            path: sameContent.path,
            old: sameContent,
            stats: {
              mtime: new Date(sameContent.updated_at)
            }
          }
        ]

        const checksum = sinon.spy()
        await prepareEvents.step(events, {
          checksum,
          initialScanParams: { flushed: false },
          pouch: this.pouch,
          syncPath: this.config.syncPath
        })
        should(checksum).not.have.been.called()
      })

      it('does not compute checksum after only a path normalization change', async function() {
        const old = await builders
          .metafile()
          .path('énoncé'.normalize('NFC'))
          .data('initial')
          .upToDate()
          .create()
        const events /*: ChokidarEvent[] */ = [
          {
            type: 'add',
            path: old.path.normalize('NFD'),
            old,
            stats: {
              mtime: new Date(old.updated_at)
            }
          }
        ]

        const checksum = sinon.spy()
        await prepareEvents.step(events, {
          checksum,
          initialScanParams: { flushed: false },
          pouch: this.pouch,
          syncPath: this.config.syncPath
        })
        should(checksum).not.have.been.called()
      })
    })
  })
})

describe('core/local/chokidar_steps/prepare_events stale unlink', () => {
  let builders

  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('set up builders', function() {
    builders = new Builders(this)
  })
  beforeEach('empty sync dir', async function() {
    await fse.emptyDir(this.config.syncPath)
  })

  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  const prepare = function(events) {
    return prepareEvents.step(events, {
      checksum: sinon.spy(),
      initialScanParams: { flushed: true },
      pouch: this.pouch,
      syncPath: this.config.syncPath
    })
  }

  const createFile = async function(filepath) {
    const abspath = path.join(this.config.syncPath, filepath)
    await fse.outputFile(abspath, 'content')
    return fse.stat(abspath)
  }

  it('drops the unlink of a file still on disk with the same inode', async function() {
    const { ino } = await createFile.call(this, 'stale')
    const old = await builders
      .metafile()
      .path('stale')
      .ino(ino)
      .upToDate()
      .create()

    should(
      await prepare.call(this, [{ type: 'unlink', path: 'stale', old }])
    ).deepEqual([])
  })

  it('keeps the unlink of a file missing from the disk', async function() {
    const old = await builders
      .metafile()
      .path('missing')
      .ino(123456)
      .upToDate()
      .create()

    should(
      await prepare.call(this, [{ type: 'unlink', path: 'missing', old }])
    ).deepEqual([{ type: 'unlink', path: 'missing', old }])
  })

  it('keeps the unlink of a file replaced by another one', async function() {
    const { ino } = await createFile.call(this, 'replaced')
    const old = await builders
      .metafile()
      .path('replaced')
      .ino(ino + 1)
      .upToDate()
      .create()

    should(
      await prepare.call(this, [{ type: 'unlink', path: 'replaced', old }])
    ).deepEqual([{ type: 'unlink', path: 'replaced', old }])
  })

  onPlatform('darwin', () => {
    it('keeps the unlink of a file renamed with a different case', async function() {
      const { ino } = await createFile.call(this, 'RENAMED')
      const old = await builders
        .metafile()
        .path('renamed')
        .ino(ino)
        .upToDate()
        .create()

      should(
        await prepare.call(this, [{ type: 'unlink', path: 'renamed', old }])
      ).deepEqual([{ type: 'unlink', path: 'renamed', old }])
    })
  })
})
