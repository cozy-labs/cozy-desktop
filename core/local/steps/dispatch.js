/* @flow */

const { buildDir, buildFile, id } = require('../../metadata')

/*::
import type Buffer from './buffer'
import type EventEmitter from 'events'
import type Prep from '../../prep'
import type Pouch from '../../pouch'
*/

const SIDE = 'local'
let events, target, pouch, actions

// Dispatch takes a buffer of AtomWatcherEvents batches, and calls Prep for
// each event. It needs to fetch the old documents from pouchdb in some cases
// to have all the data expected by prep/merge.
module.exports = function (buffer /*: Buffer */, opts /*: { events: EventEmitter, prep: Prep, pouch: Pouch } */) {
  events = opts.events
  target = opts.prep
  pouch = opts.pouch
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
    try {
      // It looks like merge expects a revision for _rev
      const old = await fetchOldDoc(id(event.path))
      doc._rev = old._rev
    } catch (err) {
      // TODO should we return target.addFileAsync(SIDE, doc) ?
    }
    await target.updateFileAsync(SIDE, doc)
  },

  modifieddirectory: async (event) => {
    const doc = buildDir(event.path, event.stats)
    try {
      // It looks like merge expects a revision for _rev
      const old = await fetchOldDoc(id(event.path))
      doc._rev = old._rev
    } catch (err) {}
    await target.putFolderAsync(SIDE, doc)
  },

  renamedfile: async (event) => {
    let doc, old
    try {
      old = await fetchOldDoc(id(event.oldPath))
      doc = buildFile(event.path, event.stats, event.md5sum)
    } catch (err) {
      // A renamed event where the source does not exist can be seen as just an
      // add. It can happen on Linux when a file is added when the client is
      // stopped, and is moved before it was scanned.
      event.action = 'created'
      delete event.oldPath
      return actions.createdfile(event)
    }
    await target.moveFileAsync(SIDE, doc, old)
  },

  renameddirectory: async (event) => {
    let doc, old
    try {
      old = await fetchOldDoc(id(event.oldPath))
      doc = buildDir(event.path, event.stats)
    } catch (err) {
      // A renamed event where the source does not exist can be seen as just an
      // add. It can happen on Linux when a dir is added when the client is
      // stopped, and is moved before it was scanned.
      event.action = 'created'
      delete event.oldPath
      return actions.createddirectory(event)
    }
    await target.moveFolderAsync(SIDE, doc, old)
  },

  deletedfile: async (event) => {
    let old
    try {
      old = await fetchOldDoc(event._id)
    } catch (err) {
      // The file was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    await target.trashFileAsync(SIDE, old)
  },

  deleteddirectory: async (event) => {
    let old
    try {
      old = await fetchOldDoc(event._id)
    } catch (err) {
      // The dir was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    await target.trashFolderAsync(SIDE, old)
  }
}

// We have to call fetchOldDoc from the dispatch step, and not in a separated
// step before that because we need that all the event batches were passed to
// prep/merge before trying to fetch the old doc. If it is not the case, if we
// have in a buffer an add event for 'foo' and just after a renamed event for
// 'foo' -> 'bar', the fetch old doc won't see 'foo' in pouch and the renamed
// event will be misleady seen as just a 'created' event for 'bar' (but 'foo'
// will still be created in pouch and not removed after that).
async function fetchOldDoc (oldId /*: string */) {
  const release = await pouch.lock('FetchOldDocs')
  try {
    return await pouch.db.get(oldId)
  } finally {
    release()
  }
}
