/* @flow */

const _ = require('lodash')
const path = require('path')

const SortedSet = require('../../utils/sorted_set')
const { id } = require('../../metadata')
const Channel = require('./channel')
const logger = require('../../logger')

const STEP_NAME = 'winDetectMove'

const log = logger({
  component: `atom/${STEP_NAME}`
})

// Wait at most this delay (in milliseconds) to see if it's a move.
// TODO tweak the value (the initial value was chosen because it looks like a
//      good value, it is not something that was computed)
const DELAY = 1000

/*::
import type { AtomEvent, Batch } from './event'
import type Pouch from '../../pouch'

type PendingItem = {
  event: AtomEvent,
  deletedIno: ?string | ?number,
  timeout: TimeoutID
}

export type WinDetectMoveState = {
  [typeof STEP_NAME]: {
    unmergedRenamedEvents: SortedSet<AtomEvent>
  }
}

type WinDetectMoveOptions = {
  pouch: Pouch,
  state: WinDetectMoveState
}
*/

module.exports = {
  forget,
  initialState,
  loop
}

const areParentChildPaths = (p /*: string */, c /*: string */) /*: boolean */ =>
  `${c}${path.sep}`.startsWith(`${p}${path.sep}`)

async function initialState() /* Promise<WinDetectMoveState> */ {
  return {
    [STEP_NAME]: {
      // eslint-disable-next-line
      unmergedRenamedEvents: new SortedSet /*:: <AtomEvent> */ ()
    }
  }
}

function forget(event /*: AtomEvent */, state /*: WinDetectMoveState */) {
  const {
    [STEP_NAME]: { unmergedRenamedEvents }
  } = state

  unmergedRenamedEvents.delete(event)
}

function previousPaths(deletedPath, unmergedRenamedEvents) {
  const { previous: previousPaths } = unmergedRenamedEvents.reduceRight(
    (paths, renamedEvent) => {
      if (
        renamedEvent.oldPath &&
        areParentChildPaths(renamedEvent.path, paths.current)
      ) {
        paths.current = paths.current.replace(
          renamedEvent.path,
          renamedEvent.oldPath
        )
        paths.previous.unshift(paths.current)
      }
      return paths
    },
    {
      current: deletedPath,
      previous: []
    }
  )
  return previousPaths
}

async function findDeletedInoById(id, pouch) {
  const doc = await pouch.byIdMaybeAsync(id)
  return doc && { deletedIno: doc.fileid || doc.ino }
}

async function findDeletedInoRecentlyRenamed(previousPaths, pouch) {
  for (const [index, previousPath] of previousPaths.entries()) {
    const doc = await pouch.byIdMaybeAsync(id(previousPath))
    if (doc) {
      return {
        deletedIno: doc.fileid || doc.ino,
        oldPaths: previousPaths.slice(index)
      }
    }
  }
}

async function findDeletedIno(event, pouch, unmergedRenamedEvents) {
  if (event.action !== 'deleted') return {}
  // OPTIMIZE: Make .previousPaths() include event.path so we don't need a lock
  const release = await pouch.lock('winDetectMove')
  try {
    return (
      (await findDeletedInoById(event._id, pouch)) ||
      (await findDeletedInoRecentlyRenamed(
        previousPaths(event.path, unmergedRenamedEvents),
        pouch
      )) ||
      {}
    )
  } finally {
    release()
  }
}

async function assignDebugInfos(event, deletedIno, oldPaths) {
  if (event.action !== 'deleted') return
  if (oldPaths) {
    _.set(event, [STEP_NAME, 'oldPaths'], oldPaths)
  } else if (!deletedIno) {
    _.set(event, [STEP_NAME, 'deletedIno'], 'unresolved')
  }
}

function eventHasIno(event, ino) {
  return ino === (event.stats.fileid || event.stats.ino)
}

function indexOfMatchingDeletedEvent(event, pendingItems) {
  if (event.action === 'created' && !event.incomplete) {
    for (let i = 0; i < pendingItems.length; i++) {
      const { deletedIno } = pendingItems[i]
      if (deletedIno && eventHasIno(event, deletedIno)) {
        return i
      }
    }
  }
  return -1
}

function aggregateEvents(createdEvent, deletedEvent) {
  const aggregatedEvents = {
    deletedEvent,
    createdEvent: _.clone(createdEvent)
  }
  createdEvent.action = 'renamed'
  createdEvent.oldPath = deletedEvent.path
  _.set(createdEvent, [STEP_NAME, 'aggregatedEvents'], aggregatedEvents)
}

function sendReadyBatches(
  waiting /*: PendingItem[] */,
  output /*: (Batch) => void */
) {
  while (waiting.length > 0) {
    if (waiting[0].deletedIno) {
      break
    }
    const item = waiting.shift()
    clearTimeout(item.timeout)
    output([item.event])
  }
}

// On windows, ReadDirectoryChangesW emits a deleted and an added events when
// a file or directory is moved. This step merges the two events to a single
// renamed event.
async function winDetectMove(
  channel,
  output,
  opts /*: WinDetectMoveOptions */
) {
  const pendingItems /*: PendingItem[] */ = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Wait for a new batch of events
    const events = await channel.pop()
    const {
      pouch,
      state: {
        [STEP_NAME]: { unmergedRenamedEvents }
      }
    } = opts

    for (const event of events) {
      // First, push the new events in the pending queue
      const { deletedIno, oldPaths } = await findDeletedIno(
        event,
        pouch,
        unmergedRenamedEvents
      )

      assignDebugInfos(event, deletedIno, oldPaths)

      const timeout = setTimeout(() => {
        output([pendingItems.shift().event])
        sendReadyBatches(pendingItems, output)
      }, DELAY)
      pendingItems.push({ event, deletedIno, timeout })

      // Then, see if a created event matches a deleted event
      const pendingIndex = indexOfMatchingDeletedEvent(event, pendingItems)
      if (pendingIndex !== -1) {
        const pendingDeleted = pendingItems[pendingIndex]
        aggregateEvents(event, pendingDeleted.event)
        clearTimeout(pendingDeleted.timeout)
        pendingItems.splice(pendingIndex, 1)
        unmergedRenamedEvents.add(event)
      }
    }

    // Finally, look if some batches can be sent without waiting
    sendReadyBatches(pendingItems, output)
  }
}

function loop(
  channel /*: Channel */,
  opts /*: WinDetectMoveOptions */
) /*: Channel */ {
  const out = new Channel()
  const output = batch => {
    out.push(batch)
  }
  winDetectMove(channel, output, opts).catch(err => {
    log.error({ err })
  })
  return out
}
