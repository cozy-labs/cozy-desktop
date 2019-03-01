/* @flow */

const { buildDir, buildFile, id } = require('../../metadata')
const logger = require('../../logger')
const log = logger({
  component: 'atom/dispatch'
})

/*::
import type Buffer from './buffer'
import type { Batch } from './event'
import type EventEmitter from 'events'
import type Prep from '../../prep'
import type Pouch from '../../pouch'

export type AtomEventsDispatcher = (Batch) => Promise<Batch>

type DispatchOptions = {
  events: EventEmitter,
  prep: Prep,
  pouch: Pouch,
  onAtomEvents?: AtomEventsDispatcher
}
*/

const SIDE = 'local'
let actions

module.exports = {
  loop,
  step
}

// Dispatch takes a buffer of AtomWatcherEvents batches, and calls Prep for
// each event. It needs to fetch the old documents from pouchdb in some cases
// to have all the data expected by prep/merge.
function loop (buffer /*: Buffer */, opts /*: DispatchOptions */) /*: Buffer */ {
  return buffer.asyncMap(
    opts.onAtomEvents || step(opts)
  )
}

function step (opts /*: DispatchOptions */) {
  return async (batch /*: Batch */) => {
    for (const event of batch) {
      try {
        log.trace({event}, 'dispatch')
        if (event.action === 'initial-scan-done') {
          actions.initialScanDone(opts)
        } else {
          await actions[event.action + event.kind](event, opts)
        }
      } catch (err) {
        log.error({err, event})
        // TODO: Error handling
      }
    }
    return batch
  }
}

actions = {
  initialScanDone: ({events}) => {
    events.emit('initial-scan-done')
  },

  scanfile: (event, opts) => actions.createdfile(event, opts),

  scandirectory: (event, opts) => actions.createddirectory(event, opts),

  createdfile: async (event, {prep}) => {
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await prep.addFileAsync(SIDE, doc)
  },

  createddirectory: async (event, {prep}) => {
    const doc = buildDir(event.path, event.stats)
    await prep.putFolderAsync(SIDE, doc)
  },

  modifiedfile: async (event, {prep}) => {
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await prep.updateFileAsync(SIDE, doc)
  },

  modifieddirectory: async (event, {prep}) => {
    const doc = buildDir(event.path, event.stats)
    await prep.putFolderAsync(SIDE, doc)
  },

  renamedfile: async (event, {pouch, prep}) => {
    let old
    try {
      old = await fetchOldDoc(pouch, id(event.oldPath))
    } catch (err) {
      log.debug({err, event}, 'Assuming move can be handled as addition')
      // A renamed event where the source does not exist can be seen as just an
      // add. It can happen on Linux when a file is added when the client is
      // stopped, and is moved before it was scanned.
      event.action = 'created'
      delete event.oldPath
      return actions.createdfile(event, {prep})
    }
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await prep.moveFileAsync(SIDE, doc, old)
  },

  renameddirectory: async (event, {pouch, prep}) => {
    let old
    try {
      old = await fetchOldDoc(pouch, id(event.oldPath))
    } catch (err) {
      log.debug({err, event}, 'Assuming move can be handled as addition')
      // A renamed event where the source does not exist can be seen as just an
      // add. It can happen on Linux when a dir is added when the client is
      // stopped, and is moved before it was scanned.
      event.action = 'created'
      delete event.oldPath
      return actions.createddirectory(event, {prep})
    }
    const doc = buildDir(event.path, event.stats)
    await prep.moveFolderAsync(SIDE, doc, old)
  },

  deletedfile: async (event, {pouch, prep}) => {
    let old
    try {
      old = await fetchOldDoc(pouch, event._id)
    } catch (err) {
      log.debug({err, event}, 'Assuming already deleted')
      // The file was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    await prep.trashFileAsync(SIDE, old)
  },

  deleteddirectory: async (event, {pouch, prep}) => {
    let old
    try {
      old = await fetchOldDoc(pouch, event._id)
    } catch (err) {
      log.debug({err, event}, 'Assuming already deleted')
      // The dir was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    await prep.trashFolderAsync(SIDE, old)
  }
}

// We have to call fetchOldDoc from the dispatch step, and not in a separated
// step before that because we need that all the event batches were passed to
// prep/merge before trying to fetch the old doc. If it is not the case, if we
// have in a buffer an add event for 'foo' and just after a renamed event for
// 'foo' -> 'bar', the fetch old doc won't see 'foo' in pouch and the renamed
// event will be misleady seen as just a 'created' event for 'bar' (but 'foo'
// will still be created in pouch and not removed after that).
async function fetchOldDoc (pouch, oldId /*: string */) {
  const release = await pouch.lock('FetchOldDocs')
  try {
    return await pouch.db.get(oldId)
  } finally {
    release()
  }
}
