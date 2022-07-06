/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')
const path = require('path')

const Producer = require('../../../../core/local/channel_watcher/parcel_producer')
const { Ignore } = require('../../../../core/ignore')
const stater = require('../../../../core/local/stater')
const EventEmitter = require('events')

const configHelpers = require('../../../support/helpers/config')
const { ContextDir } = require('../../../support/helpers/context_dir')
const { onPlatforms } = require('../../../support/helpers/platform')

onPlatforms(['linux', 'win32'], () => {
  describe('core/local/channel_watcher/producer', () => {
    let syncDir
    let config
    let ignore
    let events
    let producer

    beforeEach('instanciate config', configHelpers.createConfig)
    beforeEach(function () {
      config = this.config
      syncDir = new ContextDir(config.syncPath)
      ignore = new Ignore([])
      events = new EventEmitter()
      producer = new Producer({ config, ignore, events })
    })

    describe('start()', () => {
      context('on readdir error on dir', () => {
        beforeEach(
          'create content with missing read permission',
          async function () {
            await syncDir.makeTree(['dirA/fileA', 'dirB/fileB', 'dirC/fileC'])
            await syncDir.chmod('dirB', 0o220)
          }
        )

        it('should not reject', async function () {
          await should(producer.start()).be.fulfilled()
          await producer.stop()
        })
      })
    })

    describe('scan()', () => {
      context('when a directory is ignored', () => {
        const ignoredDir = 'ignored-dir'
        const notIgnoredFile = 'not-ignored-file'
        let ignore

        beforeEach(async () => {
          ignore = new Ignore([ignoredDir])
          producer = new Producer({ config, ignore, events })

          await syncDir.makeTree([
            `${ignoredDir}/`,
            `${ignoredDir}/subdir/`,
            `${ignoredDir}/subdir/file`,
            `${notIgnoredFile}`
          ])
        })

        it('does not produce events for it and its descendants', async () => {
          await producer.scan('.')

          const outputBatch = await producer.channel.pop()
          should(outputBatch.map(e => e.path)).deepEqual([notIgnoredFile])
        })
      })
    })

    describe('API of the producer', () => {
      it('should register on start and dispose on stop the watcher', async () => {
        await producer.start()
        should(producer.watcher).be.not.null()
        await producer.stop()
        should(producer.watcher).be.null()
      })

      it('should change absolute path to relative with process', async () => {
        // XXX: Don't replace `created` events with `scan` events
        producer.initialScanDone = true

        const dirname = 'foobar'
        const batch = [
          {
            action: 'created',
            kind: 'directory',
            ino: 1,
            path: syncDir.abspath(dirname)
          }
        ]
        producer.processEvents(_.cloneDeep(batch))
        should(await producer.channel.pop()).eql(
          batch.map(evt => Object.assign({}, evt, { path: dirname }))
        )
      })

      it('should scan a subfolder tree', async () => {
        await syncDir.ensureDir('foo/bar/baz')
        await producer.start()

        try {
          const batch = await producer.channel.pop()
          should(
            batch.map(({ action, kind, path }) => ({
              action,
              kind,
              path
            }))
          ).eql([
            {
              action: 'scan',
              kind: 'directory',
              path: 'foo'
            },
            {
              action: 'scan',
              kind: 'directory',
              path: path.normalize('foo/bar')
            },
            {
              action: 'scan',
              kind: 'directory',
              path: path.normalize('foo/bar/baz')
            }
          ])
        } finally {
          await producer.stop()
        }
      })
    })

    describe('register an event on FS events', () => {
      beforeEach(async () => {
        await producer.start()
        await producer.channel.pop()
      })
      afterEach(async () => {
        await producer.stop()
      })

      it('detect events on folder in temp dir', async () => {
        const dirname = 'foobaz'
        const newname = 'foobarbaz'

        await syncDir.ensureDir(dirname)
        const { ino, fileid } = await stater.stat(syncDir.abspath(dirname))
        should(await producer.channel.pop()).eql([
          {
            action: 'created',
            kind: 'directory',
            path: dirname,
            ino: fileid || ino
          }
        ])

        await syncDir.rename(dirname, newname)
        should(await producer.channel.pop()).eql([
          {
            action: 'renamed',
            kind: 'directory',
            oldPath: dirname,
            path: newname,
            ino: fileid || ino
          }
        ])

        await syncDir.rmdir(newname)
        should(await producer.channel.pop()).eql([
          {
            action: 'deleted',
            kind: 'directory',
            path: newname,
            deletedIno: fileid || ino
          }
        ])
      })

      it('detect events on file in temp dir', async () => {
        const filename = 'barbaz'
        const newname = 'barfoobaz'
        const content = 'Hello, Cozy Drive for Desktop'

        await syncDir.outputFile(filename, content)
        const { ino, fileid } = await stater.stat(syncDir.abspath(filename))
        should(await producer.channel.pop()).eql([
          {
            action: 'created',
            kind: 'file',
            path: filename,
            ino: fileid || ino
          }
        ])

        await syncDir.rename(filename, newname)
        should(await producer.channel.pop()).eql([
          {
            action: 'renamed',
            kind: 'file',
            oldPath: 'barbaz',
            path: 'barfoobaz',
            ino: fileid || ino
          }
        ])

        await syncDir.unlink(newname)
        should(await producer.channel.pop()).eql([
          {
            action: 'deleted',
            kind: 'file',
            path: newname,
            deletedIno: fileid || ino
          }
        ])
      })
    })
  })
})
