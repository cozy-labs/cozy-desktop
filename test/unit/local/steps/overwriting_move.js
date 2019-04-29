/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')

const Buffer = require('../../../../core/local/steps/buffer')
const overwritingMove = require('../../../../core/local/steps/overwriting_move')

const Builders = require('../../../support/builders')

/*::
import type {
  EventAction,
  EventKind
} from '../../../../core/local/steps/event'
*/

describe('core/local/steps/overwriting_move', () => {
  describe('.loop()', () => {
    let builders, inputBuffer, outputBuffer

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
      inputBuffer = new Buffer()
      outputBuffer = overwritingMove.loop(inputBuffer, {
        pouch: {
          byIdMaybeAsync: async id => _.cloneDeep(docs[id])
        },
        state: overwritingMove.initialState()
      })
    })

    const inputBatch = batch => inputBuffer.push(_.cloneDeep(batch))
    const outputBatch = () => outputBuffer.pop()

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
          [overwritingMove.STEP_NAME]: { deletedBeforeRenamed: renamedEvent }
        },
        {
          ...renamedEvent,
          overwrite: true,
          [overwritingMove.STEP_NAME]: { moveToDeletedPath: deletedEvent }
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
          [overwritingMove.STEP_NAME]: { deletedBeforeRenamed: renamedEvent }
        },
        {
          ...renamedEvent,
          overwrite: true,
          [overwritingMove.STEP_NAME]: { moveToDeletedPath: deletedEvent }
        }
      ])
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
