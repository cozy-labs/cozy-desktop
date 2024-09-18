/** This step handles file additions/moves overwriting their destination.
 *
 * @module core/local/channel_watcher/overwrite
 * @flow
 */

const _ = require('lodash')

const Channel = require('./channel')
const { logger } = require('../../utils/logger')

/*::
import type { ChannelEvent, ChannelBatch } from './event'
import type { Metadata } from '../../metadata'

type PendingBatch = {
  deletedEventsByPath: Map<string, ChannelEvent>,
  events: ChannelBatch,
  timeout?: TimeoutID
}

type OverwriteState = {
  deletedEventsByPath: Map<string, ChannelEvent>,
  pendingBatches: PendingBatch[]
}

type OverwriteOptions = {
  state: {
    [typeof STEP_NAME]: OverwriteState
  }
}
*/

const STEP_NAME = 'overwrite'

const log = logger({
  component: `ChannelWatcher/${STEP_NAME}`
})

/**
 * Wait at most this delay (in milliseconds) to fix overwriting move related
 * events.
 */
const DELAY = 500

const initialState = () => ({
  [STEP_NAME]: {
    // eslint-disable-next-line
    deletedEventsByPath: new Map /*:: <string,ChannelEvent> */ (),
    pendingBatches: []
  }
})

/** Current batch becomes pending.
 *
 * So we can:
 * - Detect overwriting move events in the next one.
 * - Possibly aggregate deleted events from the current (now pending) one.
 */
const rotateState = (state, events, output) => {
  const pending /*: Object */ = {
    deletedEventsByPath: state.deletedEventsByPath,
    events
  }
  pending.timeout = setTimeout(() => {
    output(state)
  }, DELAY)
  state.pendingBatches.push((pending /*: PendingBatch */))

  state.deletedEventsByPath = new Map()
}

/** Deleted event ids match moved ones. */
const indexDeletedEvent = (event, state) => {
  if (event.action === 'deleted') {
    state.deletedEventsByPath.set(event.path, event)
  }
}

const findDeletedEvent = (path, state) => {
  if (state.deletedEventsByPath.has(path)) {
    return state.deletedEventsByPath.get(path)
  } else {
    for (const pending of state.pendingBatches) {
      if (pending.deletedEventsByPath.has(path)) {
        return pending.deletedEventsByPath.get(path)
      }
    }
  }
}

/** Possibly change event action to 'ignored'.
 *
 * In case it is a deleted event related to an overwriting move.
 */
const ignoreDeletedBeforeOverwritingMove = (event, state) => {
  const { path } = event
  const pendingDeletedEvent = findDeletedEvent(path, state)
  if (pendingDeletedEvent) {
    const deletedClone = _.clone(pendingDeletedEvent)
    const renamedClone = _.clone(event)

    event.overwrite = true
    _.set(event, [STEP_NAME, 'moveToDeletedPath'], deletedClone)
    pendingDeletedEvent.action = 'ignored'
    _.set(
      pendingDeletedEvent,
      [STEP_NAME, 'deletedBeforeRenamed'],
      renamedClone
    )
  }
}

/** Possibly change event action to 'ignored'.
 *
 * In case it is a deleted event preceding a replacement.
 * We expect the Merge step to be able to merge the created event as is, even
 * without deleting the document first.
 * However, we want to ignore the deleted event so we don't move the original
 * file to the trash.
 */
const ignoreDeletedBeforeOverwritingAdd = (event, state) => {
  const { path } = event
  const pendingDeletedEvent = findDeletedEvent(path, state)
  if (pendingDeletedEvent) {
    const deletedClone = _.clone(pendingDeletedEvent)
    const createdClone = _.clone(event)

    _.set(event, [STEP_NAME, 'createOnDeletedPath'], deletedClone)
    pendingDeletedEvent.action = 'ignored'
    _.set(pendingDeletedEvent, [STEP_NAME, 'deletedBeforeCreate'], createdClone)
  }
}

/** Process an event batch. */
const step = async (
  batch /*: ChannelBatch */,
  opts /*: OverwriteOptions */
) => {
  const {
    state: { [STEP_NAME]: state }
  } = opts

  for (const event of batch) {
    indexDeletedEvent(event, state)

    if (event.action === 'renamed') {
      ignoreDeletedBeforeOverwritingMove(event, state)
    } else if (event.action === 'created') {
      ignoreDeletedBeforeOverwritingAdd(event, state)
    }
  }
}

const _loop = async (channel, out, opts) => {
  const output = state => {
    const pending = state.pendingBatches.shift()
    if (pending) out.push(pending.events)
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const events = await channel.pop()
    const {
      state: { [STEP_NAME]: state }
    } = opts

    await step(events, opts)

    rotateState(state, events, output)
  }
}

const loop = (channel /*: Channel */, opts /*: OverwriteOptions */) => {
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
