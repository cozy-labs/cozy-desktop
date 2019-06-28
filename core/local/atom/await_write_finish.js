/** This step is a port of awaitWriteFinish (aWF) from chokidar.
 *
 * It debounces write events for files, as we can have several of them in a
 * short lapse of time, and computing the checksum several times in a row for
 * the same file is not a good idea.
 *
 * @module core/local/atom/await_write_finish
 * @flow
 */

const _ = require('lodash')

const Channel = require('./channel')
const logger = require('../../utils/logger')

const STEP_NAME = 'awaitWriteFinish'

const log = logger({
  component: `atom/${STEP_NAME}`
})

/**
 * Wait this delay (in milliseconds) after the last event for a given file
 * before pushing this event to the next steps.
 *
 * TODO: tweak the value (the initial value was chosen because it looks like a
 * good value, it is not something that was computed).
 */
const DELAY = 200

/*::
import type { AtomEvent } from './event'

type WaitingItem = {
  events: AtomEvent[],
  nbCandidates: number,
  timeout: TimeoutID
}
*/

module.exports = {
  loop
}

// TODO add unit tests and logs

function sendReadyBatches(waiting /*: WaitingItem[] */, out /*: Channel */) {
  while (waiting.length > 0) {
    if (waiting[0].nbCandidates !== 0) {
      break
    }
    const item = waiting.shift()
    clearTimeout(item.timeout)
    out.push(item.events)
  }
}

/** Count the candidates for debouncing with future events */
function countFileWriteEvents(events /*: AtomEvent[] */) /*: number */ {
  let nbCandidates = 0
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.incomplete) {
      continue
    }
    if (
      event.kind === 'file' &&
      ['created', 'modified'].includes(event.action)
    ) {
      nbCandidates++
    }
  }
  return nbCandidates
}

function aggregateBatch(events) {
  const lastWritesByPath = new Map()
  const aggregatedEvents = []

  events.forEach(event => {
    if (isAggregationCandidate(event)) {
      const lastWrite = lastWritesByPath.get(event.path)
      if (lastWrite) {
        const aggregatedEvent = aggregateEvents(lastWrite, event)
        const lastWriteIndex = aggregatedEvents.indexOf(lastWrite)

        if (aggregatedEvent) {
          aggregatedEvents.splice(lastWriteIndex, 1, aggregatedEvent)
        } else {
          aggregatedEvents.splice(lastWriteIndex, 1)
        }

        lastWritesByPath.set(lastWrite.path, aggregatedEvent)
      } else {
        lastWritesByPath.set(event.path, event)
        aggregatedEvents.push(event)
      }
    } else {
      aggregatedEvents.push(event)
    }
  })

  return aggregatedEvents
}

function isAggregationCandidate(event) {
  return (
    !event.incomplete &&
    event.kind === 'file' &&
    ['created', 'modified', 'deleted'].includes(event.action)
  )
}

function aggregateEvents(oldEvent, recentEvent) {
  if (recentEvent.action === 'deleted' && oldEvent.action === 'created') {
    // It's just a temporary file that we can ignore
    log.debug(
      { createdEvent: oldEvent, deletedEvent: recentEvent },
      `Ignore ${oldEvent.kind} ${oldEvent.action} then ${recentEvent.action}`
    )

    return
  }

  if (recentEvent.action === 'modified') {
    addDebugInfo(recentEvent, oldEvent)
    // Preserve the action from the first event (it can be a created file)
    recentEvent.action = oldEvent.action
  }

  return recentEvent
}

function addDebugInfo(event, previousEvent) {
  _.update(event, [STEP_NAME, 'previousEvents'], previousEvents =>
    _.concat(
      // Event to aggregate
      [
        _.pick(previousEvent, [
          'action',
          'stats.ino',
          'stats.fileid',
          'stats.size',
          'stats.atime',
          'stats.mtime',
          'stats.ctime',
          'stats.birthtime'
        ])
      ],
      // Events previously aggregated on `event`
      _.toArray(previousEvents),
      // Events previously aggregated on `e`
      _.get(previousEvent, [STEP_NAME, 'previousEvents'], [])
    )
  )
  // Previous events have been aggregated on the most recent event
  // $FlowFixMe we are well aware that `awaitWriteFinish` is not part of AtomEvent
  delete previousEvent[STEP_NAME]
}

/** Look if we can debounce some waiting events with the current events */
function debounce(waiting /*: WaitingItem[] */, events /*: AtomEvent[] */) {
  for (let i = 0; i < events.length; i++) {
    const event = events[i]

    if (event.incomplete) {
      continue
    }

    if (
      event.kind === 'file' &&
      ['modified', 'deleted'].includes(event.action)
    ) {
      for (let j = 0; j < waiting.length; j++) {
        const w = waiting[j]

        if (w.nbCandidates === 0) {
          continue
        }

        for (let k = 0; k < w.events.length; k++) {
          const e = w.events[k]

          if (
            ['created', 'modified'].includes(e.action) &&
            e.path === event.path
          ) {
            w.events.splice(k, 1)
            w.nbCandidates--

            if (event.action === 'modified') {
              addDebugInfo(event, e)
              // Preserve the action from the first event (it can be a created file)
              event.action = e.action
            }

            if (event.action === 'deleted' && e.action === 'created') {
              // It's just a temporary file that we can ignore
              log.debug(
                { createdEvent: e, deletedEvent: event },
                `Ignore ${e.kind} ${e.action} then ${event.action}`
              )
              events.splice(i, 1)
              i--
            }

            break
          }
        }
      }
    }
  }
}

async function awaitWriteFinish(channel /*: Channel */, out /*: Channel */) {
  const waiting /*: WaitingItem[] */ = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const events = aggregateBatch(await channel.pop())
    let nbCandidates = countFileWriteEvents(events)
    debounce(waiting, events)

    // Push the new batch of events in the queue
    const timeout = setTimeout(() => {
      out.push(waiting.shift().events)
      sendReadyBatches(waiting, out)
    }, DELAY)
    waiting.push({ events, nbCandidates, timeout })

    // Look if some batches can be sent without waiting
    sendReadyBatches(waiting, out)
  }
}

// eslint-disable-next-line no-unused-vars
function loop(channel /*: Channel */, opts /*: {} */) /*: Channel */ {
  const out = new Channel()
  awaitWriteFinish(channel, out).catch(err => {
    log.error({ err })
  })
  return out
}
