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

type WaitingBatch = {
  events: AtomWatcherEvent[],
  nbCandidates: number,
  timeout: TimeoutID
}
*/

// TODO add unit tests and logs

// This is a port of awaitWriteFinish (aWF) from chokidar. It debounces write
// events for files, as we can have several of them in a short lapse of time,
// and computing the checksum several times in a row for the same file is not a
// good idea.
async function awaitWriteFinish (buffer, out) {
  const waiting /*: WaitingBatch[] */ = []
  const sendReadyBatches = () => {
    while (waiting.length > 0) {
      if (waiting[0].nbCandidates !== 0) {
        break
      }
      const w = waiting.shift()
      clearTimeout(w.timeout)
      if (w.events.length > 0) {
        out.push(w.events)
      }
    }
  }

  while (true) {
    // Wait for a new batch of events
    const events = await buffer.pop()
    let nbCandidates = 0

    for (let i = 0; i < events.length; i++) {
      const event = events[i]

      // Ignore events that can't be debounced
      if (event.action === 'initial-scan-done' || event.kind !== 'file') {
        continue
      }

      // Count the candidates for debouncing with future events
      if (['created', 'modified'].includes(event.action)) {
        nbCandidates++
      }

      // Look if we can debounce some past events with the current event
      if (['modified', 'deleted'].includes(event.action)) {
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

    // Push the new batch of events in the queue
    const timeout = setTimeout(() => {
      out.push(waiting.shift().events)
      sendReadyBatches()
    }, DELAY)
    waiting.push({ events, nbCandidates, timeout })

    // Look if some batches can be sent without waiting
    sendReadyBatches()
  }
}

module.exports = function (buffer /*: Buffer */, opts /*: {} */) /*: Buffer */ {
  const out = new Buffer()
  awaitWriteFinish(buffer, out)
    .catch(err => log.error({err}))
  return out
}
