/* eslint-env mocha */
/* @flow */

const should = require('should')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { onPlatform } = require('../../../support/helpers/platform')
const LinuxProducer = require('../../../../core/local/steps/linux_producer')

onPlatform('linux', () => {
  describe('core/local/steps/linux_producer', () => {
    describe('API of the producer', () => {
      let syncPath
      let producer

      beforeEach(() => {
        syncPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
        producer = new LinuxProducer({
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
        should(await producer.buffer.pop()).eql(
          batch.map(evt => Object.assign({}, evt, { path: dirname }))
        )
      })

      it('should scan a subfolder tree', async () => {
        const mypath = ['foo', 'bar', 'baz']
        mkdirSyncRecursive(syncPath, mypath.join('/'))
        await producer.start()

        const batches = [
          {
            batch: await producer.buffer.pop(),
            path: path.join(mypath[0])
          },
          {
            batch: await producer.buffer.pop(),
            path: path.join(mypath[0], mypath[1])
          },
          {
            batch: await producer.buffer.pop(),
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
              kind: 'unknown',
              path: originalPath
            }
          ])
        })
      })
    })

    describe('register an event on FS events', () => {
      let syncPath
      let producer

      before(async () => {
        syncPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
        producer = new LinuxProducer({
          syncPath
        })
        await producer.start()
        await producer.buffer.pop()
      })

      it('detect events on folder in temp dir', async () => {
        const dirname = 'foobaz'
        const newname = 'foobarbaz'
        fs.mkdirSync(path.join(syncPath, dirname))
        should(await producer.buffer.pop()).eql([
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
        should(await producer.buffer.pop()).eql([
          {
            action: 'renamed',
            kind: 'directory',
            oldPath: dirname,
            path: newname
          }
        ])
        fs.rmdirSync(path.join(syncPath, newname))
        should(await producer.buffer.pop()).eql([
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
        should(await producer.buffer.pop()).eql([
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
        should(await producer.buffer.pop()).eql([
          {
            action: 'renamed',
            kind: 'file',
            oldPath: 'barbaz',
            path: 'barfoobaz'
          }
        ])
        fs.unlinkSync(path.join(syncPath, newname))
        should(await producer.buffer.pop()).eql([
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

function mkdirSyncRecursive (syncPath = '/', mypath = '/') {
  mypath.split('/').reduce((acc, folder) => {
    fs.mkdirSync(path.join(acc, folder))
    return `${acc}/${folder}`
  }, syncPath)
}
