/** This step is a port of awaitWriteFinish (aWF) from chokidar.
 *
 * It debounces write events for files, as we can have several of them in a
 * short lapse of time, and computing the checksum several times in a row for
 * the same file is not a good idea.
 *
 * @module core/local/channel_watcher/await_write_finish
 * @flow
 */

const _ = require('lodash')

const Channel = require('./channel')
const { logger } = require('../../utils/logger')

const STEP_NAME = 'awaitWriteFinish'

const log = logger({
  component: `ChannelWatcher/${STEP_NAME}`
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
import type { ChannelEvent } from './event'

type WaitingItem = {
  events: ChannelEvent[],
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
function countFileWriteEvents(events /*: ChannelEvent[] */) /*: number */ {
  let nbCandidates = 0
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.incomplete) {
      continue
    }
    if (
      event.kind === 'file' &&
      ['created', 'modified', 'renamed'].includes(event.action)
    ) {
      nbCandidates++
    }
  }
  return nbCandidates
}

function ino(event /*: ChannelEvent */) {
  return (
    (event.stats && (event.stats.fileid || event.stats.ino)) || event.deletedIno
  )
}

function aggregateBatch(events) {
  const lastWritesByPath = new Map()
  const aggregatedEvents = []

  events.forEach(event => {
    const lastWrite = lastWritesByPath.get(event.path)
    if (lastWrite && isAggregationCandidate(event, lastWrite)) {
      const aggregatedEvent = aggregateEvents(lastWrite, event)
      const lastWriteIndex = aggregatedEvents.indexOf(lastWrite)

      if (aggregatedEvent) {
        aggregatedEvents.splice(lastWriteIndex, 1, aggregatedEvent)
      } else {
        aggregatedEvents.splice(lastWriteIndex, 1)
      }

      lastWritesByPath.set(lastWrite.path, aggregatedEvent)
    } else {
      if (!event.incomplete) {
        lastWritesByPath.set(event.path, event)
      }
      aggregatedEvents.push(event)
    }
  })

  return aggregatedEvents
}

function isAggregationCandidate(event, lastWrite) {
  return (
    !event.incomplete &&
    event.kind === 'file' &&
    ['created', 'modified', 'deleted', 'renamed'].includes(event.action) &&
    (lastWrite.action !== 'renamed' || ino(event) === ino(lastWrite))
  )
}

function aggregateEvents(oldEvent, recentEvent) {
  if (recentEvent.action === 'deleted') {
    if (oldEvent.action === 'created') {
      // It's just a temporary file that we can ignore
      log.debug(
        `Ignore ${oldEvent.kind} ${oldEvent.action} then ${recentEvent.action}`,
        { createdEvent: oldEvent, deletedEvent: recentEvent }
      )

      return
    } else if (oldEvent.action === 'renamed') {
      addDebugInfo(recentEvent, oldEvent)

      recentEvent.path = oldEvent.oldPath
    }
  }

  if (recentEvent.action === 'modified') {
    addDebugInfo(recentEvent, oldEvent)
    // Preserve the action from the first event (it can be a created file)
    recentEvent.action = oldEvent.action

    if (oldEvent.action === 'renamed') {
      recentEvent.oldPath = oldEvent.oldPath
    }
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
  // $FlowFixMe we are well aware that `awaitWriteFinish` is not part of ChannelEvent
  delete previousEvent[STEP_NAME]
}

/** Look if we can debounce some waiting events with the current events */
function debounce(waiting /*: WaitingItem[] */, events /*: ChannelEvent[] */) {
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
            (['created', 'modified'].includes(e.action) ||
              (e.action === 'renamed' && ino(e) === ino(event))) &&
            e.path === event.path
          ) {
            w.events.splice(k, 1)
            w.nbCandidates--

            if (event.action === 'modified') {
              addDebugInfo(event, e)
              // Preserve the action from the first event (it can be a created file)
              event.action = e.action

              if (e.action === 'renamed') {
                event.oldPath = e.oldPath
              }
            }

            if (event.action === 'deleted') {
              if (e.action === 'created') {
                // It's just a temporary file that we can ignore
                log.debug(`Ignore ${e.kind} ${e.action} then ${event.action}`, {
                  createdEvent: e,
                  deletedEvent: event
                })
                events.splice(i, 1)
                i--
              } else if (e.action === 'renamed') {
                addDebugInfo(event, e)
                // Delete document at oldPath instead of moving then deleting
                if (e.oldPath) {
                  event.path = e.oldPath
                }
              }
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
    log.warn({ err })
  })
  return out
}
