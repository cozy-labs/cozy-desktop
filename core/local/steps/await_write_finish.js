/* @flow */

const Buffer = require('./buffer')
const logger = require('../../logger')
const log = logger({
  component: 'awaitWriteFinish'
})

// Wait this delay (in milliseconds) after the last event for a given file
// before pushing this event to the next steps.
// TODO tweak the value (the initial value was chosen because it looks like a
//      good value, it is not something that was computed)
const DELAY = 200

/*::
import type { AtomWatcherEvent } from './event'

type WaitingItem = {
  events: AtomWatcherEvent[],
  nbCandidates: number,
  timeout: TimeoutID
}
*/

module.exports = {
  loop
}

// TODO add unit tests and logs

function sendReadyBatches (waiting /*: WaitingItem[] */, out /*: Buffer */) {
  while (waiting.length > 0) {
    if (waiting[0].nbCandidates !== 0) {
      break
    }
    const item = waiting.shift()
    clearTimeout(item.timeout)
    if (item.events.length > 0) {
      out.push(item.events)
    }
  }
}

// Count the candidates for debouncing with future events
function countFileWriteEvents (events /*: AtomWatcherEvent[] */) /*: number */ {
  let nbCandidates = 0
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.incomplete) {
      continue
    }
    if (event.kind === 'file' && ['created', 'modified'].includes(event.action)) {
      nbCandidates++
    }
    if (event.action === 'deleted') {
      nbCandidates++
    }
  }
  return nbCandidates
}

// Look if we can debounce some waiting events with the current events
function debounce (waiting /*: WaitingItem[] */, events /*: AtomWatcherEvent[] */) {
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.incomplete) {
      continue
    }
    if (event.action === 'renamed') {
      for (let j = 0; j < waiting.length; j++) {
        const w = waiting[j]
        if (w.nbCandidates === 0) { continue }
        for (let k = 0; k < w.events.length; k++) {
          const e = w.events[k]
          if (e.action === 'deleted' && e.path === event.path) {
            w.events.splice(k, 1)
            w.nbCandidates--
            event.overwrite = true
            break
          }
        }
      }
    }
    if (event.kind === 'file' && ['modified', 'deleted'].includes(event.action)) {
      for (let j = 0; j < waiting.length; j++) {
        const w = waiting[j]
        if (w.nbCandidates === 0) { continue }
        for (let k = 0; k < w.events.length; k++) {
          const e = w.events[k]
          if (['created', 'modified'].includes(e.action) && e.path === event.path) {
            w.events.splice(k, 1)
            w.nbCandidates--
            if (event.action === 'modified') {
              // Preserve the action from the first event (it can be a created file)
              event.action = e.action
            }
            if (event.action === 'deleted' && e.action === 'created') {
              // It's just a temporary file that we can ignore
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

// This is a port of awaitWriteFinish (aWF) from chokidar. It debounces write
// events for files, as we can have several of them in a short lapse of time,
// and computing the checksum several times in a row for the same file is not a
// good idea.
async function awaitWriteFinish (buffer /*: Buffer */, out /*: Buffer */) {
  const waiting /*: WaitingItem[] */ = []

  while (true) {
    const events = await buffer.pop()
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

function loop (buffer /*: Buffer */, opts /*: {} */) /*: Buffer */ {
  const out = new Buffer()
  awaitWriteFinish(buffer, out)
    .catch(err => log.error({err}))
  return out
}
