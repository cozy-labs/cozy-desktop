/* @flow */

const { id } = require('../../metadata')
const Buffer = require('./buffer')

// Wait this delay (in milliseconds) after the last event for a given file
// before pushing this event to the next steps.
const Delay = 200

/*::
import type { AtomWatcherEvent } from './event'

type PendingItem = {
  action: "created" | "modified",
  fire: *,
  event: AtomWatcherEvent,
  timeout: TimeoutID
}
*/

// TODO add unit tests and logs

// This is a port of awaitWriteFinish (aWF) from chokidar. It debounces write
// events for files, as we can have several of them in a short lapse of time,
// and computing the checksum several times in a row for the same file is not a
// good idea.
async function awaitWriteFinish (buffer, out) {
  const pending = new Map()

  while (true) {
    const events = await buffer.pop()
    const batch = []

    for (const event of events) {
      if (event.action === 'initial-scan-done' || event.kind !== 'file') {
        batch.push(event)
        continue
      }

      let item /*: ?PendingItem */ = pending.get(event._id)
      if (['created', 'modified'].includes(event.action)) {
        if (item) {
          item.event = event
          clearTimeout(item.timeout)
          item.timeout = setTimeout(item.fire, Delay)
        } else {
          const fire = () => {
            // We want the last event for stats...
            // $FlowFixMe
            const e = pending.get(event._id).event
            // ...but to preserve the action from the first event
            e.action = event.action
            out.push([e])
            pending.delete(event._id)
          }
          item = {
            action: event.action,
            event: event,
            fire: fire,
            timeout: setTimeout(fire, Delay)
          }
        }
        pending.set(event._id, item)
        continue
      }

      if (item) {
        if (event.action === 'scan') {
          // Ignore the scan and let aWF fires an event for this path
          continue
        }
        if (event.action === 'deleted') {
          clearTimeout(item.timeout)
          pending.delete(event._id)
          // Ignore temporary files that are created and removed just after
          if (item.action === 'created') {
            continue
          }
        }
      }

      if (event.action === 'renamed') {
        const oldId = id(event.oldPath)
        const old = pending.get(oldId)
        if (old) {
          clearTimeout(old.timeout)
          old.fire()
        }
      }

      batch.push(event)
    }

    if (batch.length > 0) {
      out.push(batch)
    }
  }
}

module.exports = function (buffer /*: Buffer */, opts /*: {} */) /*: Buffer */ {
  const out = new Buffer()
  awaitWriteFinish(buffer, out)
  return out
}
