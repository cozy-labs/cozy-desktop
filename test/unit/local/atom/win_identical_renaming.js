/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')

const Channel = require('../../../../core/local/atom/channel')
const winIdenticalRenaming = require('../../../../core/local/atom/win_identical_renaming')
const metadata = require('../../../../core/metadata')

const Builders = require('../../../support/builders')

/*::
import type {
  EventAction,
  EventKind
} from '../../../../core/local/atom/event'
*/

if (process.platform === 'win32') {
  describe('core/local/atom/win_identical_renaming', () => {
    describe('.loop()', () => {
      let builders, inputChannel, outputChannel

      beforeEach(() => {
        builders = new Builders()
        const docs = {
          DIR: builders
            .metadir()
            .path('dir')
            .build(),
          FILE: builders
            .metafile()
            .path('file')
            .build()
        }
        inputChannel = new Channel()
        outputChannel = winIdenticalRenaming.loop(inputChannel, {
          pouch: {
            bySyncedPath: async path => _.cloneDeep(docs[metadata.id(path)])
          },
          state: winIdenticalRenaming.initialState()
        })
      })

      const inputBatch = batch => inputChannel.push(_.cloneDeep(batch))
      const outputBatch = () => outputChannel.pop()

      describe('broken case-only renaming', () => {
        it('fixes renamed directory (DIR -> DIR) matching dir to (dir -> DIR) after .DELAY', async () => {
          const renamedEvent = builders
            .event()
            .action('renamed')
            .kind('directory')
            .oldPath('DIR')
            .path('DIR')
            .build()

          inputBatch([renamedEvent])

          should(await outputBatch()).deepEqual([
            {
              ...renamedEvent,
              oldPath: 'dir',
              [winIdenticalRenaming.STEP_NAME]: { oldPathBeforeFix: 'DIR' }
            }
          ])
        })

        it('ignores deleted file (DIR) followed by renamed directory (DIR → DIR) matching dir', async () => {
          const deletedEvent = builders
            .event()
            .action('deleted')
            .kind('file')
            .path('DIR')
            .build()
          const renamedEvent = builders
            .event()
            .action('renamed')
            .kind('directory')
            .oldPath('DIR')
            .path('DIR')
            .build()

          inputBatch([deletedEvent, renamedEvent])

          const fixedRenamedEvent = {
            ...renamedEvent,
            oldPath: 'dir',
            [winIdenticalRenaming.STEP_NAME]: { oldPathBeforeFix: 'DIR' }
          }

          should(await outputBatch()).deepEqual([
            {
              ...deletedEvent,
              action: 'ignored',
              [winIdenticalRenaming.STEP_NAME]: {
                deletedBeforeRenamed: fixedRenamedEvent
              }
            },
            fixedRenamedEvent
          ])
        })

        it('ignores deleted file (file) followed by renamed file (file → FILE) matching file', async () => {
          const deletedEvent = builders
            .event()
            .action('deleted')
            .kind('file')
            .path('file')
            .build()
          const renamedEvent = builders
            .event()
            .action('renamed')
            .kind('file')
            .oldPath('file')
            .path('FILE')
            .build()

          inputBatch([deletedEvent, renamedEvent])

          should(await outputBatch()).deepEqual([
            {
              ...deletedEvent,
              action: 'ignored',
              [winIdenticalRenaming.STEP_NAME]: {
                deletedBeforeRenamed: renamedEvent
              }
            },
            renamedEvent
          ])
        })

        it('leaves renamed directory (\u00e9, \u0301e) untouched', async () => {
          const renamedEvent = builders
            .event()
            .action('renamed')
            .kind('directory')
            .oldPath('\u00e9')
            .path('\u0301e')
            .build()

          inputBatch([renamedEvent])

          should(await outputBatch()).deepEqual([renamedEvent])
        })

        it('leaves renamed file (\u00e9, \u0301e) untouched', async () => {
          const renamedEvent = builders
            .event()
            .action('renamed')
            .kind('file')
            .oldPath('\u00e9')
            .path('\u0301e')
            .build()

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
          { action: 'created', kind: 'directory', path: 'unknown' },
          { action: 'created', kind: 'file', path: 'newFile' },
          { action: 'modified', kind: 'file', path: 'newFile' },
          { action: 'deleted', kind: 'file', path: 'newFile' },
          { action: 'deleted', kind: 'file', path: 'file' },
          {
            action: 'renamed',
            kind: 'directory',
            oldPath: 'UNKNOWN',
            path: 'UNKNOWN'
          },
          { action: 'renamed', kind: 'file', oldPath: 'file', path: 'FILE' }
        ]

        const buildEvent = ({ action, kind, path, oldPath }) => {
          let event = builders
            .event()
            .action(action)
            .kind(kind)
            .path(path)
          if (oldPath) event.oldPath(oldPath)
          return event.build()
        }

        for (const { action, kind, oldPath, path } of scenarios) {
          it(`forwards ${action} ${kind} (${
            oldPath ? oldPath + ' -> ' : ''
          }${path})`, async () => {
            const batch = [buildEvent({ action, kind, path, oldPath })]

            inputBatch(batch)

            should(await outputBatch()).deepEqual(batch)
          })
        }

        it('forwards all events preceding first deleted event without delay', async () => {
          const batch = scenarios.map(buildEvent)

          inputBatch(batch)

          const firstDeletedEventIndex = 3
          // The events preceding the first deleted event
          should(await outputBatch()).deepEqual(
            batch.slice(0, firstDeletedEventIndex)
          )
        })
      })
    })
  })
}
