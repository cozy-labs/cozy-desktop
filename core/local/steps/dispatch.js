/* @flow */

const { buildDir, buildFile } = require('../../metadata')

/*::
import type Buffer from './buffer'
import type EventEmitter from 'events'
import type Prep from '../../prep'
*/

const SIDE = 'local'
let events, target, actions

// Dispatch takes a buffer of AtomWatcherEvents batches, and calls Prep for
// each event.
module.exports = function (buffer /*: Buffer */, opts /*: { events: EventEmitter, prep: Prep } */) {
  events = opts.events
  target = opts.prep
  buffer.asyncForEach(async (batch) => {
    for (const event of batch) {
      try {
        if (event.action === 'initial-scan-done') {
          actions.initialScanDone()
        } else {
          // $FlowFixMe
          await actions[event.action + event.docType](event)
        }
      } catch (err) {
        console.log('Dispatch error:', err) // TODO
      }
    }
  })
}

actions = {
  initialScanDone: () => {
    events.emit('initial-scan-done')
  },

  scanfile: (event) => actions.createdfile(event),

  scandirectory: (event) => actions.createddirectory(event),

  createdfile: async (event) => {
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await target.addFileAsync(SIDE, doc)
  },

  createddirectory: async (event) => {
    const doc = buildDir(event.path, event.stats)
    await target.putFolderAsync(SIDE, doc)
  },

  modifiedfile: async (event) => {
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await target.updateFileAsync(SIDE, doc)
  },

  modifieddirectory: (event) => actions.createddirectory(event),

  renamedfile: async (event) => {
    // TODO we don't have stats and md5sum
    const src = buildFile(event.oldPath, event.stats, event.md5sum)
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await target.moveFileAsync(SIDE, doc, src)
  },

  renameddirectory: async (event) => {
    // TODO we don't have stats
    const src = buildDir(event.oldPath, event.stats)
    const doc = buildDir(event.path, event.stats)
    await target.moveFolderAsync(SIDE, doc, src)
  },

  deletedfile: async (event) => {
    // TODO we don't have stats and md5sum for deleted files
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await target.trashFileAsync(SIDE, doc)
  },

  deleteddirectory: async (event) => {
    // TODO we don't have stats for deleted folders
    const doc = buildDir(event.path, event.stats)
    await target.trashFolderAsync(SIDE, doc)
  }
}
