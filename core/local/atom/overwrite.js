/* @flow */

const _ = require('lodash')

const Channel = require('./channel')
const logger = require('../../utils/logger')

/*::
import type { AtomEvent, AtomBatch } from './event'
import type { Metadata } from '../../metadata'

type OverwriteState = {
  deletedEventsByPath: Map<string, AtomEvent>,
  pending: {
    deletedEventsByPath: Map<string, AtomEvent>,
    events: AtomBatch,
    timeout?: TimeoutID
  }
}

type PouchFunctions = {
  byIdMaybeAsync: (string) => Promise<?Metadata>
}

type OverwriteOptions = {
  state: {
    [typeof STEP_NAME]: OverwriteState
  }
}
*/

const STEP_NAME = 'overwrite'

const log = logger({
  component: `atom/${STEP_NAME}`
})

// Wait at most this delay (in milliseconds) to fix overwriting move related
// events.
const DELAY = 500

const initialState = () => ({
  [STEP_NAME]: {
    // eslint-disable-next-line
    deletedEventsByPath: new Map /*:: <string,AtomEvent> */ (),
    pending: {
      // eslint-disable-next-line
      deletedEventsByPath: new Map /*:: <string,AtomEvent> */ (),
      events: []
    }
  }
})

/** Current batch becomes pending.
 *
 * So we can:
 * - Detect overwriting move events in the next one.
 * - Possibly aggregate deleted events from the current (now pending) one.
 */
const rotateState = (state, events) => {
  state.pending = {
    deletedEventsByPath: state.deletedEventsByPath,
    events
  }
  state.deletedEventsByPath = new Map()
}

/** Deleted event ids match moved ones. */
const indexDeletedEvent = (event, state) => {
  if (event.action === 'deleted') {
    state.deletedEventsByPath.set(event.path, event)
  }
}

/** Possibly change event action to 'ignored'.
 *
 * In case it is a deleted event related to an overwriting move.
 */
const ignoreDeletedBeforeOverwritingMove = (event, state) => {
  const { path } = event
  const pendingDeletedEvent =
    state.deletedEventsByPath.get(path) ||
    state.pending.deletedEventsByPath.get(path)
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
  const pendingDeletedEvent =
    state.deletedEventsByPath.get(path) ||
    state.pending.deletedEventsByPath.get(path)
  if (pendingDeletedEvent) {
    const deletedClone = _.clone(pendingDeletedEvent)
    const createdClone = _.clone(event)

    _.set(event, [STEP_NAME, 'createOnDeletedPath'], deletedClone)
    pendingDeletedEvent.action = 'ignored'
    _.set(pendingDeletedEvent, [STEP_NAME, 'deletedBeforeCreate'], createdClone)
  }
}

/** Process an event batch. */
const step = async (batch /*: AtomBatch */, opts /*: OverwriteOptions */) => {
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
  const output = pending => {
    clearTimeout(pending.timeout)
    out.push(pending.events)
    pending.deletedEventsByPath = new Map()
    pending.events = []
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const events = await channel.pop()
    const {
      state: { [STEP_NAME]: state }
    } = opts

    await step(events, opts)

    output(state.pending)
    rotateState(state, events)

    const { pending } = state
    pending.timeout = setTimeout(() => {
      output(pending)
    }, DELAY)
  }
}

const loop = (channel /*: Channel */, opts /*: OverwriteOptions */) => {
  const out = new Channel()

  _loop(channel, out, opts).catch(err => {
    log.error({ err })
  })

  return out
}

module.exports = {
  STEP_NAME,
  initialState,
  loop,
  step
}
