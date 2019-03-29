/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')

const Buffer = require('../../../../core/local/steps/buffer')
const winIdenticalRenaming = require('../../../../core/local/steps/win_identical_renaming')

const Builders = require('../../../support/builders')

/*::
import type {
  EventAction,
  EventKind
} from '../../../../core/local/steps/event'
*/

if (process.platform === 'win32') {
  describe('core/local/steps/win_identical_renaming', () => {
    describe('.loop()', () => {
      let builders, inputBuffer, outputBuffer

      beforeEach(() => {
        builders = new Builders()
        const docs = {
          DIR: builders.metadir().path('dir').build(),
          FILE: builders.metafile().path('file').build()
        }
        inputBuffer = new Buffer()
        outputBuffer = winIdenticalRenaming.loop(inputBuffer, {
          pouch: {
            byIdMaybeAsync: async id => _.cloneDeep(docs[id])
          },
          state: winIdenticalRenaming.initialState()
        })
      })

      const inputBatch = batch => inputBuffer.push(_.cloneDeep(batch))
      const outputBatch = () => outputBuffer.pop()

      describe('broken case-only renaming', () => {
        it('fixes renamed directory (DIR -> DIR) matching dir to (dir -> DIR) after .DELAY', async () => {
          const renamedEvent = builders.event().action('renamed')
            .kind('directory').oldPath('DIR').path('DIR').build()

          inputBatch([renamedEvent])

          should(await outputBatch()).deepEqual([
            {
              ...renamedEvent,
              oldPath: 'dir',
              [winIdenticalRenaming.STEP_NAME]: {oldPathBeforeFix: 'DIR'}
            }
          ])
        })

        it('ignores deleted file (DIR) followed by renamed directory (DIR → DIR) matching dir', async () => {
          const deletedEvent = builders.event().action('deleted')
            .kind('file').path('DIR').build()
          const renamedEvent = builders.event().action('renamed')
            .kind('directory').oldPath('DIR').path('DIR').build()

          inputBatch([deletedEvent, renamedEvent])

          const fixedRenamedEvent = {
            ...renamedEvent,
            oldPath: 'dir',
            [winIdenticalRenaming.STEP_NAME]: {oldPathBeforeFix: 'DIR'}
          }

          should(await outputBatch()).deepEqual([
            {
              ...deletedEvent,
              action: 'ignored',
              [winIdenticalRenaming.STEP_NAME]: { deletedBeforeRenamed: fixedRenamedEvent }
            },
            fixedRenamedEvent
          ])
        })

        it('ignores deleted file (file) followed by renamed file (file → FILE) matching file', async () => {
          const deletedEvent = builders.event().action('deleted')
            .kind('file').path('file').build()
          const renamedEvent = builders.event().action('renamed')
            .kind('file').oldPath('file').path('FILE').build()

          inputBatch([deletedEvent, renamedEvent])

          should(await outputBatch()).deepEqual([
            {
              ...deletedEvent,
              action: 'ignored',
              [winIdenticalRenaming.STEP_NAME]: { deletedBeforeRenamed: renamedEvent }
            },
            renamedEvent
          ])
        })

        it('leaves renamed directory (\u00e9, \u0301e) untouched', async () => {
          const renamedEvent = builders.event().action('renamed')
            .kind('directory').oldPath('\u00e9').path('\u0301e').build()

          inputBatch([renamedEvent])

          should(await outputBatch()).deepEqual([renamedEvent])
        })

        it('leaves renamed file (\u00e9, \u0301e) untouched', async () => {
          const renamedEvent = builders.event().action('renamed')
            .kind('file').oldPath('\u00e9').path('\u0301e').build()

          inputBatch([renamedEvent])

          should(await outputBatch()).deepEqual([renamedEvent])
        })
      })

      describe('everything else', () => {
        /*::
        type Scenario = {
          action: EventAction,
          kind: EventKind,
          oldPath?: string,
          path: string
        }
        */
        const scenarios /*: Scenario[] */ = [
          {action: 'created', kind: 'directory', path: 'unknown'},
          {action: 'deleted', kind: 'file', path: 'file'},
          {action: 'renamed', kind: 'directory', oldPath: 'UNKNOWN', path: 'UNKNOWN'},
          {action: 'renamed', kind: 'file', oldPath: 'file', path: 'FILE'}
        ]

        for (const { action, kind, oldPath, path } of scenarios) {
          it(`forwards ${action} ${kind} (${oldPath ? oldPath + ' -> ' : ''}${path}) after .DELAY`, async () => {
            let event = builders.event().action(action).kind(kind).path(path)
            if (oldPath) event.oldPath(oldPath)
            const batch = [event.build()]

            inputBatch(batch)

            should(await outputBatch()).deepEqual(batch)
          })
        }
      })
    })
  })
}
