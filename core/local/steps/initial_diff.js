/* @flow */

const _ = require('lodash')
const path = require('path')

const logger = require('../../logger')
const { id } = require('../../metadata')
const Buffer = require('./buffer')

/*::
import type Pouch from '../../pouch'
import type { AtomWatcherEvent, Batch, EventKind } from './event'
import type { Metadata } from '../../metadata'

type InitialDiffState = {
  [typeof STEP_NAME]: {
    waiting: WaitingItem[],
    renamedEvents: AtomWatcherEvent[],
    scannedPaths: Set<string>,
    byInode: Map<number|string, Metadata>,
  }
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

const log = logger({
  component: `atom/${STEP_NAME}`
})

const areParentChildPaths = (
  p /*: ?string */,
  c /*: ?string */
) /*: boolean %checks */ =>
  !!p && !!c && p !== c && `${c}${path.sep}`.startsWith(`${p}${path.sep}`)

module.exports = {
  STEP_NAME,
  loop,
  initialState,
  clearState
}

// Some files and directories can have been deleted while cozy-desktop was
// stopped. So, at the end of the initial scan, we have to do a diff between
// what was in pouchdb and the events from the local watcher to find what was
// deleted.
function loop(
  buffer /*: Buffer */,
  opts /*: { pouch: Pouch, state: InitialDiffState } */
) /*: Buffer */ {
  const out = new Buffer()
  initialDiff(buffer, out, opts.pouch, opts.state).catch(err => {
    log.error({ err })
  })
  return out
}

async function initialState(
  opts /*: { pouch: Pouch } */
) /*: Promise<InitialDiffState> */ {
  const waiting /*: WaitingItem[] */ = []
  const renamedEvents /*: AtomWatcherEvent[] */ = []
  const scannedPaths /*: Set<string> */ = new Set()

  // Using inode/fileId is more robust that using path or id for detecting
  // which files/folders have been deleted, as it is stable even if the
  // file/folder has been moved or renamed
  const byInode /*: Map<number|string, Metadata> */ = new Map()
  const docs /*: Metadata[] */ = await opts.pouch.byRecursivePathAsync('')
  for (const doc of docs) {
    if (doc.ino != null) {
      // Process only files/dirs that were created locally or synchronized
      byInode.set(doc.fileid || doc.ino, doc)
    }
  }

  return {
    [STEP_NAME]: { waiting, renamedEvents, scannedPaths, byInode }
  }
}

function clearState(state /*: InitialDiffState */) {
  const {
    [STEP_NAME]: { waiting, scannedPaths, byInode }
  } = state

  for (const item of waiting) {
    clearTimeout(item.timeout)
  }

  state[STEP_NAME].waiting = []
  state[STEP_NAME].renamedEvents = []
  scannedPaths.clear()
  byInode.clear()
}

async function initialDiff(
  buffer /*: Buffer */,
  out /*: Buffer */,
  pouch /*: Pouch */,
  state /*: InitialDiffState */
) /*: Promise<void> */ {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const events = await buffer.pop()
    const {
      [STEP_NAME]: { waiting, renamedEvents, scannedPaths, byInode }
    } = state

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
        let was /*: ?Metadata */
        if (event.stats.fileid) {
          was = byInode.get(event.stats.fileid)
        }
        if (!was) {
          was = byInode.get(event.stats.ino)
        }

        if (was && was.moveFrom && was.moveFrom.path === event.path) {
          _.set(event, [STEP_NAME, 'unappliedMoveTo'], was.path)
          event.action = 'ignored'
        } else if (was && was.path !== event.path) {
          if (kind(was) === event.kind) {
            // TODO for a directory, maybe we should check the children
            _.set(event, [STEP_NAME, 'actionConvertedFrom'], event.action)
            event.action = 'renamed'
            event.oldPath = was.path
            nbCandidates++
          } else {
            // On linux, the inodes can have been reused: a file was deleted
            // and a directory created just after while the client was stopped
            // for example.
            batch.push({
              action: 'deleted',
              kind: kind(was),
              _id: id(was.path),
              [STEP_NAME]: { inodeReuse: event },
              path: was.path
            })
          }
        } else if (foundUntouchedFile(event, was)) {
          _.set(event, [STEP_NAME, 'md5sumReusedFrom'], was.path)
          event.md5sum = was.md5sum
        }
      }

      if (
        ['created', 'modified', 'renamed', 'scan', 'ignored'].includes(
          event.action
        )
      ) {
        if (event.stats) {
          byInode.delete(event.stats.fileid)
          byInode.delete(event.stats.ino)
        }
        scannedPaths.add(event.path)
      }

      fixPathsAfterParentMove(renamedEvents, event)

      if (event.action === 'renamed') {
        // Needs to be pushed after the oldPath has been fixed
        renamedEvents.push(event)
      }

      if (event.action === 'initial-scan-done') {
        // Emit deleted events for all the remaining files/dirs
        for (const [, doc] of byInode) {
          if (!scannedPaths.has(doc.path)) {
            const deletedEvent /*: AtomWatcherEvent */ = {
              action: 'deleted',
              kind: kind(doc),
              _id: id(doc.path),
              path: doc.path
            }
            fixPathsAfterParentMove(renamedEvents, deletedEvent)
            _.set(
              deletedEvent,
              [STEP_NAME, 'notFound'],
              _.defaults(
                _.pick(deletedEvent, ['kind', 'path']),
                _.pick(doc, ['md5sum', 'updated_at'])
              )
            )
            batch.push(deletedEvent)
          }
        }
        clearState(state)
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

function sendReadyBatches(waiting /*: WaitingItem[] */, out /*: Buffer */) {
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
function debounce(
  waiting /*: WaitingItem[] */,
  events /*: AtomWatcherEvent[] */
) {
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.incomplete) {
      continue
    }
    if (event.action === 'scan') {
      for (let j = 0; j < waiting.length; j++) {
        const w = waiting[j]
        if (w.nbCandidates === 0) {
          continue
        }
        for (let k = 0; k < w.batch.length; k++) {
          const e = w.batch[k]
          if (e.action === 'renamed' && e.path === event.path) {
            log.debug(
              { renamedEvent: e, scanEvent: event },
              `Ignore overlapping ${event.kind} ${event.action}`
            )
            events.splice(i, 1)
            w.nbCandidates--
            break
          }
        }
      }
    }
  }
}

function fixPathsAfterParentMove(renamedEvents, event) {
  for (const renamedEvent of renamedEvents) {
    if (
      event.oldPath &&
      areParentChildPaths(renamedEvent.oldPath, event.oldPath)
    ) {
      const oldPathFixed = event.oldPath.replace(
        renamedEvent.oldPath,
        renamedEvent.path
      )
      if (event.path === oldPathFixed) {
        event.action = 'ignored'
      } else {
        event.oldPath = oldPathFixed
      }
      _.set(
        event,
        [STEP_NAME, 'renamedAncestor'],
        _.pick(renamedEvent, ['oldPath', 'path'])
      )
    }

    if (areParentChildPaths(renamedEvent.oldPath, event.path)) {
      const pathFixed = event.path.replace(
        renamedEvent.oldPath,
        renamedEvent.path
      )
      if (event.oldPath && event.oldPath === pathFixed) {
        event.action = 'ignored'
      } else {
        event.path = pathFixed
        event._id = id(event.path)
      }
      _.set(
        event,
        [STEP_NAME, 'renamedAncestor'],
        _.pick(renamedEvent, ['oldPath', 'path'])
      )
    }
  }
}

function eventUpdateTime(event) {
  const { ctime, mtime } = event.stats
  return Math.max(ctime.getTime(), mtime.getTime())
}

function docUpdateTime(was) {
  return new Date(was.updated_at).getTime()
}

function foundUntouchedFile(event, was) /*: boolean %checks */ {
  return (
    was != null &&
    was.md5sum != null &&
    event.kind === 'file' &&
    eventUpdateTime(event) === docUpdateTime(was)
  )
}

function kind(doc /*: Metadata */) /*: EventKind */ {
  return doc.docType === 'folder' ? 'directory' : doc.docType
}
