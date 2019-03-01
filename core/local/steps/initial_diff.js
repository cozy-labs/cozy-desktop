/* @flow */

const { id } = require('../../metadata')
const Buffer = require('./buffer')

/*::
import type Pouch from '../../pouch'
import type { AtomWatcherEvent, Batch, EventKind } from './event'
import type { Metadata } from '../../metadata'

type InitialDiffState = {
  waiting: WaitingItem[],
  byInode: Map<number|string, WatchedPath>,
  byPath: Map<string, WatchedPath>,
}

type WatchedPath = {
  path: string,
  kind: EventKind,
}

type WaitingItem = {
  batch: AtomWatcherEvent[],
  nbCandidates: number,
  timeout: TimeoutID
}
*/

// Wait this delay (in milliseconds) after the last event for a given file
// before pushing this event to the next steps.
// TODO tweak the value (the initial value was chosen because it looks like a
//      good value, it is not something that was computed)
const DELAY = 200
const STEP_NAME = 'initialDiff'

module.exports = {
  STEP_NAME,
  loop,
  initialState
}

// Some files and directories can have been deleted while cozy-desktop was
// stopped. So, at the end of the initial scan, we have to do a diff between
// what was in pouchdb and the events from the local watcher to find what was
// deleted.
function loop (buffer /*: Buffer */, opts /*: { pouch: Pouch, state: Object } */) /*: Buffer */ {
  const out = new Buffer()
  initialDiff(buffer, out, opts.pouch, opts.state)
  return out
}

async function initialState (opts /*: { pouch: Pouch } */) /*: Promise<{ [typeof STEP_NAME]: InitialDiffState }> */ {
  const waiting /*: WaitingItem[] */ = []

  // Using inode/fileId is more robust that using path or id for detecting
  // which files/folders have been deleted, as it is stable even if the
  // file/folder has been moved or renamed
  const byInode /*: Map<number|string, WatchedPath> */ = new Map()
  const byPath /*: Map<string, WatchedPath> */ = new Map()
  const docs /*: Metadata[] */ = await opts.pouch.byRecursivePathAsync('')
  for (const doc of docs) {
    if (doc.ino != null) {
      // Process only files/dirs that were created locally or synchronized
      const kind = doc.docType === 'file' ? 'file' : 'directory'
      byInode.set(doc.fileid || doc.ino, { path: doc.path, kind: kind })
    }
  }

  return {
    [STEP_NAME]: { waiting, byInode, byPath }
  }
}

async function initialDiff (buffer /*: Buffer */, out /*: Buffer */, pouch /*: Pouch */, state /*: Object */) /*: Promise<void> */ {
  while (true) {
    const events = await buffer.pop()
    const { [STEP_NAME]: { waiting, byInode, byPath } } = state

    let nbCandidates = 0

    debounce(waiting, events)

    const batch /*: Batch */ = []
    for (const event of events) {
      if (event.incomplete) {
        batch.push(event)
        continue
      }

      // Detect if the file was moved while the client was stopped
      if (['created', 'scan'].includes(event.action)) {
        let was /*: ?WatchedPath */
        if (event.stats.fileid) {
          was = byInode.get(event.stats.fileid)
        }
        if (!was) {
          was = byInode.get(event.stats.ino)
        }
        if (was && was.path !== event.path) {
          if (was.kind === event.kind) {
            // TODO for a directory, maybe we should check the children
            event.action = 'renamed'
            event.oldPath = was.path
            nbCandidates++
          } else {
            // On linux, the inodes can have been reused: a file was deleted
            // and a directory created just after while the client was stopped
            // for example.
            batch.push({
              action: 'deleted',
              kind: was.kind,
              _id: id(was.path),
              path: was.path
            })
          }
        }
      }

      if (['created', 'modified', 'renamed', 'scan'].includes(event.action)) {
        if (event.stats.fileid) {
          byInode.delete(event.stats.fileid)
        }
        byInode.delete(event.stats.ino)
        byPath.set(event.path, { path: event.path, kind: event.kind })
      } else if (event.action === 'initial-scan-done') {
        // Emit deleted events for all the remaining files/dirs
        for (const [, doc] of byInode) {
          if (!byPath.get(doc.path)) {
            batch.push({
              action: 'deleted',
              kind: doc.kind,
              _id: id(doc.path),
              path: doc.path
            })
          }
        }
        byInode.clear()
        byPath.clear()
      }
      batch.push(event)
    }

    // Push the new batch of events in the queue
    const timeout = setTimeout(() => {
      out.push(waiting.shift().batch)
      sendReadyBatches(waiting, out)
    }, DELAY)
    waiting.push({ batch, nbCandidates, timeout })

    // Look if some batches can be sent without waiting
    sendReadyBatches(waiting, out)
  }
}

function sendReadyBatches (waiting /*: WaitingItem[] */, out /*: Buffer */) {
  while (waiting.length > 0) {
    if (waiting[0].nbCandidates !== 0) {
      break
    }
    const item = waiting.shift()
    clearTimeout(item.timeout)
    out.push(item.batch)
  }
}

// Look if we can debounce some waiting events with the current events
function debounce (waiting /*: WaitingItem[] */, events /*: AtomWatcherEvent[] */) {
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.incomplete) {
      continue
    }
    if (event.action === 'scan') {
      for (let j = 0; j < waiting.length; j++) {
        const w = waiting[j]
        if (w.nbCandidates === 0) { continue }
        for (let k = 0; k < w.batch.length; k++) {
          const e = w.batch[k]
          if (e.action === 'renamed' && e.path === event.path) {
            events.splice(i, 1)
            w.nbCandidates--
            break
          }
        }
      }
    }
  }
}
