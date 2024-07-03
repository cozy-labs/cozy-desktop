/** This step handles identical renaming on Windows.
 *
 * An identical renaming is a renaming where the source and destination would
 * both have the same identity on the current filesystem:
 *
 * - Names differing only by their case: `foo` vs `Foo` vs `FOO`
 * - Names equivalent from a Unicode point of view
 *
 * @module core/local/channel_watcher/win_identical_renaming
 * @flow
 */

const _ = require('lodash')

const Channel = require('./channel')
const { logger } = require('../../utils/logger')
const metadata = require('../../metadata')

/*::
import type { ChannelEvent, ChannelBatch } from './event'
import type { Metadata } from '../../metadata'

type WinIdenticalRenamingState = {
  deletedEventsByNormalizedPath: Map<string, ChannelEvent>,
  pending: {
    deletedEventsByNormalizedPath: Map<string, ChannelEvent>,
    events: ChannelBatch,
    timeout?: TimeoutID
  }
}

type PouchFunctions = {
  byLocalPath: (string) => Promise<?Metadata>
}

type WinIdenticalRenamingOptions = {
  pouch: PouchFunctions,
  state: {
    [typeof STEP_NAME]: WinIdenticalRenamingState
  }
}
*/

const STEP_NAME = 'winIdenticalRenaming'

const log = logger({
  component: `ChannelWatcher/${STEP_NAME}`
})

/**
 * Wait at most this delay (in milliseconds) to fix identical renaming related
 * events.
 */
const DELAY = 500

const initialState = () => ({
  [STEP_NAME]: {
    // eslint-disable-next-line
    deletedEventsByNormalizedPath: new Map /*:: <string,ChannelEvent> */ (),
    pending: {
      // eslint-disable-next-line
      deletedEventsByNormalizedPath: new Map /*:: <string,ChannelEvent> */ (),
      events: []
    }
  }
})

/** Current batch becomes pending.
 *
 * So we can:
 * - Detect identical renaming events in the next one.
 * - Possibly aggregate broken deleted events from the current (now pending)
 *   one.
 */
const rotateState = (state, events) => {
  state.pending = {
    deletedEventsByNormalizedPath: state.deletedEventsByNormalizedPath,
    events
  }
  state.deletedEventsByNormalizedPath = new Map()
}

/** Broken deleted event ids match identical renamed ones. */
const indexDeletedEvent = (event, state) => {
  if (event.action === 'deleted') {
    state.deletedEventsByNormalizedPath.set(metadata.id(event.path), event)
  }
}

/** Possibly fix oldPath when event is identical renamed. */
const fixIdenticalRenamed = async (event, { byLocalPath }) => {
  if (event.path === event.oldPath) {
    const doc /*: ?Metadata */ = await byLocalPath(event.path)

    if (doc && !doc.trashed && doc.path !== event.oldPath) {
      _.set(event, [STEP_NAME, 'oldPathBeforeFix'], event.oldPath)
      event.oldPath = doc.path
    }
  }
}

/** Possibly change event action to 'ignored'.
 *
 * In case it is a broken deleted event related to an identical renaming.
 */
const ignoreDeletedBeforeIdenticalRenamed = (event, state) => {
  const pendingDeletedEvent =
    state.deletedEventsByNormalizedPath.get(metadata.id(event.path)) ||
    state.pending.deletedEventsByNormalizedPath.get(metadata.id(event.path))
  if (pendingDeletedEvent) {
    pendingDeletedEvent.action = 'ignored'
    _.set(pendingDeletedEvent, [STEP_NAME, 'deletedBeforeRenamed'], event)
  }
}

/** Process an event batch. */
const step = async (
  batch /*: ChannelBatch */,
  opts /*: WinIdenticalRenamingOptions */
) => {
  const {
    pouch,
    state: { [STEP_NAME]: state }
  } = opts

  for (const event of batch) {
    indexDeletedEvent(event, state)

    if (event.action === 'renamed') {
      await fixIdenticalRenamed(event, pouch)
      ignoreDeletedBeforeIdenticalRenamed(event, state)
    }
  }
}

const _loop = async (channel, out, opts) => {
  const output = (pending, fastTrackEvents = []) => {
    clearTimeout(pending.timeout)
    out.push(pending.events.concat(fastTrackEvents))
    pending.deletedEventsByNormalizedPath = new Map()
    pending.events = []
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const events = await channel.pop()
    const {
      state: { [STEP_NAME]: state }
    } = opts

    await step(events, opts)

    const firstDeleted = events.findIndex(event => event.action === 'deleted')
    if (firstDeleted === -1) {
      output(state.pending, events)
      rotateState(state, [])
    } else {
      output(state.pending, events.slice(0, firstDeleted))
      rotateState(state, events.slice(firstDeleted))
    }

    const { pending } = state
    pending.timeout = setTimeout(() => {
      output(pending)
    }, DELAY)
  }
}

const loop = (
  channel /*: Channel */,
  opts /*: WinIdenticalRenamingOptions */
) => {
  const out = new Channel()

  _loop(channel, out, opts).catch(err => {
    log.warn({ err })
  })

  return out
}

module.exports = {
  STEP_NAME,
  initialState,
  loop,
  step
}
