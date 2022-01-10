/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')
const path = require('path')

const Producer = require('../../../../core/local/atom/producer')
const { Ignore } = require('../../../../core/ignore')
const stater = require('../../../../core/local/stater')
const EventEmitter = require('events')

const configHelpers = require('../../../support/helpers/config')
const { ContextDir } = require('../../../support/helpers/context_dir')
const { onPlatforms } = require('../../../support/helpers/platform')

onPlatforms(['linux', 'win32'], () => {
  describe('core/local/atom/producer', () => {
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

      context('on readdir / stat race condition', () => {
        const missingFileName = 'i-am-missing'
        const readdir = async () => [missingFileName]

        it('produces incomplete scan event on ENOENT', async () => {
          const { channel } = producer

          await producer.scan('', { readdir, stater })

          should(await channel.pop()).deepEqual([
            {
              action: 'scan',
              path: missingFileName,
              kind: 'unknown',
              incomplete: true
            }
          ])
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
        const dirname = 'foobar'
        const batch = [
          {
            action: 'created',
            kind: 'directory',
            path: syncDir.abspath(dirname)
          }
        ]
        producer.process(batch.map(evt => Object.assign({}, evt)))
        should(await producer.channel.pop()).eql(
          batch.map(evt => Object.assign({}, evt, { path: dirname }))
        )
      })

      it('should scan a subfolder tree', async () => {
        await syncDir.ensureDir('foo/bar/baz')
        await producer.start()

        const batches = [
          {
            batch: await producer.channel.pop(),
            path: path.normalize('foo')
          },
          {
            batch: await producer.channel.pop(),
            path: path.normalize('foo/bar')
          },
          {
            batch: await producer.channel.pop(),
            path: path.normalize('foo/bar/baz')
          }
        ]

        batches.forEach(({ batch, path: originalPath }) => {
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
              path: originalPath
            }
          ])
        })
      })
    })

    describe('register an event on FS events', () => {
      beforeEach(async () => {
        await producer.start()
        await producer.channel.pop()
      })

      it('detect events on folder in temp dir', async () => {
        const dirname = 'foobaz'
        const newname = 'foobarbaz'
        await syncDir.ensureDir(dirname)
        should(await producer.channel.pop()).eql([
          {
            action: 'created',
            kind: 'directory',
            path: dirname
          }
        ])
        await syncDir.rename(dirname, newname)
        should(await producer.channel.pop()).eql([
          {
            action: 'renamed',
            kind: 'directory',
            oldPath: dirname,
            path: newname
          }
        ])
        await syncDir.rmdir(newname)
        should(await producer.channel.pop()).eql([
          {
            action: 'deleted',
            kind: 'directory',
            path: newname
          }
        ])
      })

      it('detect events on file in temp dir', async () => {
        const filename = 'barbaz'
        const newname = 'barfoobaz'
        const content = 'Hello, Cozy Drive for Desktop'
        await syncDir.outputFile(filename, content)
        const outputBatches = [await producer.channel.pop()]
        if (outputBatches[0].length === 1) {
          // The modified event ended up in a separate batch.
          // This seems to happen more frequently on Windows.
          outputBatches.push(await producer.channel.pop())
        }
        const possibleBatches = [
          [
            {
              action: 'created',
              kind: 'file',
              path: filename
            },
            {
              action: 'modified',
              kind: 'file',
              path: filename
            }
          ]
        ]
        if (process.platform === 'win32') {
          possibleBatches.push([
            {
              action: 'created',
              kind: 'file',
              path: filename
            },
            {
              action: 'modified',
              kind: 'file',
              path: filename
            },
            {
              action: 'modified',
              kind: 'file',
              path: filename
            }
          ])
        }
        should(_.flatten(outputBatches)).be.oneOf(possibleBatches)
        await syncDir.rename(filename, newname)
        let renamedOutputBatch = await producer.channel.pop()
        if (
          renamedOutputBatch.length === 1 &&
          renamedOutputBatch[0].action === 'modified'
        ) {
          // A modified event on the old path may occur before the renamed one.
          // This seems to happen sometimes on Windows.
          should(renamedOutputBatch).deepEqual([
            {
              action: 'modified',
              kind: 'file',
              path: 'barbaz'
            }
          ])
          // Let's replace it with the next batch so we can look for the
          // renamed event:
          renamedOutputBatch = await producer.channel.pop()
        }
        should(renamedOutputBatch).eql([
          {
            action: 'renamed',
            kind: 'file',
            oldPath: 'barbaz',
            path: 'barfoobaz'
          }
        ])
        await syncDir.unlink(newname)
        should(await producer.channel.pop()).eql([
          {
            action: 'deleted',
            kind: 'file',
            path: newname
          }
        ])
      })
    })
  })
})
