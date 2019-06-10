/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')
const os = require('os')
const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')
const { onPlatforms } = require('../../../support/helpers/platform')
const Producer = require('../../../../core/local/atom/producer')
const stater = require('../../../../core/local/stater')

onPlatforms(['linux', 'win32'], () => {
  describe('core/local/atom/producer', () => {
    describe('scan()', () => {
      const producer = new Producer({ syncPath: '' })

      describe('on readdir / stat race condition', () => {
        const missingFilePath = 'i-am-missing'
        const readdir = async () => [missingFilePath]

        it('produces incomplete scan event on ENOENT', async () => {
          const { channel } = producer

          await producer.scan('', { readdir, stater })

          should(await channel.pop()).deepEqual([
            {
              action: 'scan',
              path: missingFilePath,
              kind: 'unknown',
              incomplete: true
            }
          ])
        })
      })
    })

    describe('API of the producer', () => {
      let syncPath
      let producer

      beforeEach(() => {
        syncPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
        producer = new Producer({
          syncPath
        })
      })

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
            path: path.join(syncPath, dirname)
          }
        ]
        producer.process(batch.map(evt => Object.assign({}, evt)))
        should(await producer.channel.pop()).eql(
          batch.map(evt => Object.assign({}, evt, { path: dirname }))
        )
      })

      it('should scan a subfolder tree', async () => {
        const mypath = ['foo', 'bar', 'baz']
        mkdirsSync(path.join(syncPath, ...mypath))
        await producer.start()

        const batches = [
          {
            batch: await producer.channel.pop(),
            path: path.join(mypath[0])
          },
          {
            batch: await producer.channel.pop(),
            path: path.join(mypath[0], mypath[1])
          },
          {
            batch: await producer.channel.pop(),
            path: path.join(mypath[0], mypath[1], mypath[2])
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
      let syncPath
      let producer

      beforeEach(async () => {
        syncPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
        producer = new Producer({
          syncPath
        })
        await producer.start()
        await producer.channel.pop()
      })

      it('detect events on folder in temp dir', async () => {
        const dirname = 'foobaz'
        const newname = 'foobarbaz'
        fs.mkdirSync(path.join(syncPath, dirname))
        should(await producer.channel.pop()).eql([
          {
            action: 'created',
            kind: 'directory',
            path: dirname
          }
        ])
        fs.renameSync(
          path.join(syncPath, dirname),
          path.join(syncPath, newname)
        )
        should(await producer.channel.pop()).eql([
          {
            action: 'renamed',
            kind: 'directory',
            oldPath: dirname,
            path: newname
          }
        ])
        fs.rmdirSync(path.join(syncPath, newname))
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
        fs.writeFileSync(path.join(syncPath, filename), content)
        const outputBatches = [await producer.channel.pop()]
        if (outputBatches[0].length === 1) {
          // The modified event ended up in a separate batch.
          // This seems to happen more frequently on Windows.
          outputBatches.push(await producer.channel.pop())
        }
        should(_.flatten(outputBatches)).deepEqual([
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
        ])
        fs.renameSync(
          path.join(syncPath, filename),
          path.join(syncPath, newname)
        )
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
        fs.unlinkSync(path.join(syncPath, newname))
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

const mkdirsSync = fse.mkdirsSync
