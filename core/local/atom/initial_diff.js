/** This step handle the events of the AtomWatcher initial scan.
 *
 * Some files and directories can have been deleted while cozy-desktop was
 * stopped. So, at the end of the initial scan, we have to do a diff between
 * what was in pouchdb and the events from the local watcher to find what was
 * deleted.
 *
 * @module core/local/atom/initial_diff
 * @flow
 */

const _ = require('lodash')
const path = require('path')

const { WINDOWS_DATE_MIGRATION_FLAG } = require('../../config')
const { kind } = require('../../metadata')
const logger = require('../../utils/logger')
const Channel = require('./channel')

/*::
import type { Config } from '../../config'
import type { Pouch } from '../../pouch'
import type { AtomEvent, AtomBatch, EventKind } from './event'
import type { Metadata } from '../../metadata'

type InitialDiffState = {
  [typeof STEP_NAME]: {
    waiting: WaitingItem[],
    renamedEvents: AtomEvent[],
    scannedPaths: Set<string>,
    byInode: Map<number|string, Metadata>,
    initialScanDone: boolean,
  }
}

type WaitingItem = {
  batch: AtomEvent[],
  nbCandidates: number,
  timeout: TimeoutID
}
*/

/**
 * Wait this delay (in milliseconds) after the last event for a given file
 * before pushing this event to the next steps.
 *
 * TODO: tweak the value (the initial value was chosen because it looks like a
 * good value, it is not something that was computed)
 */
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

function loop(
  channel /*: Channel */,
  opts /*: { config: Config, state: InitialDiffState } */
) /*: Channel */ {
  const out = new Channel()
  initialDiff(channel, out, opts).catch(err => {
    log.warn({ err })
  })
  return out
}

async function initialState(
  opts /*: { pouch: Pouch } */
) /*: Promise<InitialDiffState> */ {
  const waiting /*: WaitingItem[] */ = []
  const renamedEvents /*: AtomEvent[] */ = []
  const scannedPaths /*: Set<string> */ = new Set()

  // Using inode/fileId is more robust that using path or id for detecting
  // which files/folders have been deleted, as it is stable even if the
  // file/folder has been moved or renamed
  const byInode /*: Map<number|string, Metadata> */ = new Map()
  const docs /*: Metadata[] */ = await opts.pouch.initialScanDocs()
  for (const doc of docs) {
    if (doc.local.ino != null) {
      // Process only files/dirs that were created locally or synchronized
      byInode.set(doc.local.fileid || doc.local.ino, doc)
    }
  }

  return {
    [STEP_NAME]: {
      waiting,
      renamedEvents,
      scannedPaths,
      byInode,
      initialScanDone: false
    }
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
  state[STEP_NAME].initialScanDone = true
  scannedPaths.clear()
  byInode.clear()
}

async function initialDiff(
  channel /*: Channel */,
  out /*: Channel */,
  { config, state } /*: { config: Config, state: InitialDiffState } */
) /*: Promise<void> */ {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const events = await channel.pop()
    const {
      [STEP_NAME]: {
        waiting,
        renamedEvents,
        scannedPaths,
        byInode,
        initialScanDone
      }
    } = state
    // TODO: remove with flag WINDOWS_DATE_MIGRATION_FLAG
    const truncateWindowsDates = config.isFlagActive(
      WINDOWS_DATE_MIGRATION_FLAG
    )

    if (initialScanDone) {
      out.push(events)
      continue
    }

    let nbCandidates = 0

    debounce(waiting, events)

    const batch /*: AtomBatch */ = []
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

        if (foundUnappliedMove(event, was)) {
          _.set(event, [STEP_NAME, 'unappliedMoveTo'], was.path)
          event.action = 'ignored'
        } else if (foundRenamedOrReplacedDoc(event, was)) {
          if (kind(was) === event.kind) {
            // TODO for a directory, maybe we should check the children
            _.set(event, [STEP_NAME, 'actionConvertedFrom'], event.action)
            event.action = 'renamed'
            event.oldPath = was.local.path
            nbCandidates++
          } else {
            // On linux, the inodes can have been reused: a file was deleted
            // and a directory created just after while the client was stopped
            // for example.
            batch.push({
              action: 'deleted',
              kind: kind(was),
              [STEP_NAME]: { inodeReuse: event },
              path: was.local.path,
              deletedIno: was.local.fileid || was.local.ino
            })
          }
        } else if (foundUntouchedFile(event, was, truncateWindowsDates)) {
          _.set(event, [STEP_NAME, 'md5sumReusedFrom'], was.local.path)
          event.md5sum = was.local.md5sum
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
          if (doc.local) {
            const deletedEvent /*: AtomEvent */ = {
              action: 'deleted',
              kind: kind(doc),
              path: doc.local.path,
              deletedIno: doc.local.fileid || doc.local.ino
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
            if (!scannedPaths.has(deletedEvent.path)) {
              batch.push(deletedEvent)
            }
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

function sendReadyBatches(waiting /*: WaitingItem[] */, out /*: Channel */) {
  while (waiting.length > 0) {
    if (waiting[0].nbCandidates !== 0) {
      break
    }
    const item = waiting.shift()
    clearTimeout(item.timeout)
    out.push(item.batch)
  }
}

/** Look if we can debounce some waiting events with the current events */
function debounce(waiting /*: WaitingItem[] */, events /*: AtomEvent[] */) {
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
        event.action = 'scan'
        // TODO: We could probably ignore the event instead.
        // At least we should remove the oldPath attribute and the
        // initialDiff.actionConvertedFrom one.
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
      if (event.oldPath !== pathFixed) {
        event.path = pathFixed
      }
      _.set(
        event,
        [STEP_NAME, 'renamedAncestor'],
        _.pick(renamedEvent, ['oldPath', 'path'])
      )
    }
  }
}

function contentUpdateTime(event, truncateWindowsDates) {
  return truncateWindowsDates
    ? event.stats.mtime.getTime() - event.stats.mtime.getMilliseconds()
    : event.stats.mtime.getTime()
}

function docUpdateTime(oldLocal) {
  return oldLocal.updated_at ? new Date(oldLocal.updated_at).getTime() : -1
}

function foundUnappliedMove(event, was) /*: boolean %checks */ {
  return was != null && was.moveFrom != null && was.moveFrom.path === event.path
}

function foundRenamedOrReplacedDoc(event, was) /*: boolean %checks */ {
  return was != null && was.local != null && was.local.path !== event.path
}

function foundUntouchedFile(
  event,
  was,
  truncateWindowsDates
) /*: boolean %checks */ {
  return (
    event.kind === 'file' &&
    was != null &&
    was.local != null &&
    was.local.md5sum != null &&
    contentUpdateTime(event, truncateWindowsDates) === docUpdateTime(was.local)
  )
}
