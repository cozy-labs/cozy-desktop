/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')

const Channel = require('../../../../core/local/atom/channel')
const overwrite = require('../../../../core/local/atom/overwrite')
const metadata = require('../../../../core/metadata')

const Builders = require('../../../support/builders')

/*::
import type {
  EventAction,
  EventKind
} from '../../../../core/local/atom/event'
*/

describe('core/local/atom/overwrite', () => {
  describe('.loop()', () => {
    let builders, inputChannel, outputChannel

    beforeEach(() => {
      builders = new Builders()
      const docs = {
        'SRC/FILE': builders
          .metafile()
          .path('src/file')
          .ino(1)
          .build(),
        'SRC/DIR': builders
          .metadir()
          .path('src/dir')
          .ino(2)
          .build(),
        'DST/FILE': builders
          .metafile()
          .path('dst/file')
          .ino(3)
          .build()
      }
      inputChannel = new Channel()
      outputChannel = overwrite.loop(inputChannel, {
        pouch: {
          bySyncedPath: async path => _.cloneDeep(docs[metadata.id(path)])
        },
        state: overwrite.initialState()
      })
    })

    const inputBatch = batch => inputChannel.push(_.cloneDeep(batch))
    const outputBatch = () => outputChannel.pop()

    it('ignores deleted file (dst/file) followed by renamed file (src/file → dst/file) with different ino', async () => {
      const deletedEvent = builders
        .event()
        .action('deleted')
        .kind('file')
        .path('dst/file')
        .build()
      const renamedEvent = builders
        .event()
        .action('renamed')
        .kind('file')
        .oldPath('src/file')
        .path('dst/file')
        .build()

      inputBatch([deletedEvent, renamedEvent])

      should(await outputBatch()).deepEqual([
        {
          ...deletedEvent,
          action: 'ignored',
          [overwrite.STEP_NAME]: { deletedBeforeRenamed: renamedEvent }
        },
        {
          ...renamedEvent,
          overwrite: true,
          [overwrite.STEP_NAME]: { moveToDeletedPath: deletedEvent }
        }
      ])
    })

    it('ignores deleted file (dst/file) followed by renamed dir (src/dir → dst/file) with different ino', async () => {
      const deletedEvent = builders
        .event()
        .action('deleted')
        .kind('file')
        .path('dst/file')
        .build()
      const renamedEvent = builders
        .event()
        .action('renamed')
        .kind('directory')
        .oldPath('src/dir')
        .path('dst/file')
        .build()

      inputBatch([deletedEvent, renamedEvent])

      should(await outputBatch()).deepEqual([
        {
          ...deletedEvent,
          action: 'ignored',
          [overwrite.STEP_NAME]: { deletedBeforeRenamed: renamedEvent }
        },
        {
          ...renamedEvent,
          overwrite: true,
          [overwrite.STEP_NAME]: { moveToDeletedPath: deletedEvent }
        }
      ])
    })

    for (const kind of ['file', 'directory']) {
      it(`ignores deleted ${kind} followed by created ${kind} with different ino`, async () => {
        const deletedEvent = builders
          .event()
          .action('deleted')
          .kind(kind)
          .path(kind)
          .build()
        const createdEvent = builders
          .event()
          .action('created')
          .kind(kind)
          .path(kind)
          .build()

        inputBatch([deletedEvent, createdEvent])

        should(await outputBatch()).deepEqual([
          {
            ...deletedEvent,
            action: 'ignored',
            [overwrite.STEP_NAME]: { deletedBeforeCreate: createdEvent }
          },
          {
            ...createdEvent,
            [overwrite.STEP_NAME]: { createOnDeletedPath: deletedEvent }
          }
        ])
      })
    }

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
        { action: 'deleted', kind: 'file', path: 'dst/file' },
        {
          action: 'renamed',
          kind: 'file',
          oldPath: 'src/file',
          path: 'dst/file'
        },
        {
          action: 'renamed',
          kind: 'directory',
          oldPath: 'src/dir',
          path: 'dst/file'
        },
        {
          action: 'created',
          kind: 'file',
          path: 'file'
        },
        {
          action: 'created',
          kind: 'directory',
          path: 'dir'
        }
      ]

      for (const { action, kind, oldPath, path } of scenarios) {
        it(`forwards ${action} ${kind} (${
          oldPath ? oldPath + ' -> ' : ''
        }${path}) after .DELAY`, async () => {
          let event = builders
            .event()
            .action(action)
            .kind(kind)
            .path(path)
          if (oldPath) event.oldPath(oldPath)
          const batch = [event.build()]

          inputBatch(batch)

          should(await outputBatch()).deepEqual(batch)
        })
      }
    })
  })
})
