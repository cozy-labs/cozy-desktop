/**
 * @module core/local/chokidar/event_buffer
 * @flow
 */

const autoBind = require('auto-bind')

/*::
type EventBufferMode = 'idle' | 'timeout'
type FlushCallback<EventType> = (EventType[]) => any
*/

/**
 * An event buffer.
 * Needs a flush callback to be called everytime the buffer is flushed.
 *
 * In *idle* mode (default), the buffer will only store pushed events and
 * you'll have to flush it manually.
 * In *timeout* mode, the buffer flushes stored events by itself when nothing
 * happens during `timeoutInMs`.
 *
 * The buffer will also flush automatically when switching from one mode to
 * another.
 *
 * Right now this class is in the local/ namespace because this is where it is
 * used, but it could be anywhere else since it doesn't have any dependency.
 */
class EventBuffer /*:: <EventType> */ {
  /*::
  locked: boolean
  events: EventType[]
  mode: EventBufferMode
  timeoutInMs: number
  timeout: *
  flushed: FlushCallback<EventType>
  */

  constructor(
    timeoutInMs /*: number */,
    flushed /*: FlushCallback<EventType> */
  ) {
    this.locked = false
    this.events = []
    this.mode = 'idle'
    this.timeoutInMs = timeoutInMs
    this.timeout = null
    this.flushed = flushed

    autoBind(this)
  }

  lock() {
    if (this.locked) {
      throw new Error('lock unavailable')
    }

    this.locked = true
  }

  unlock() {
    this.locked = false
  }

  push(event /*: EventType */) /*: void */ {
    this.events.push(event)
    this.shiftTimeout()
  }

  unflush(events /*: Array<EventType> */) /*: void */ {
    this.events = events.concat(this.events)
    this.shiftTimeout()
  }

  shiftTimeout() /*: void */ {
    if (this.mode === 'timeout') {
      this.clearTimeout()
      this.timeout = setTimeout(this.flush, this.timeoutInMs)
    }
  }

  clearTimeout() /*: void */ {
    if (this.timeout != null) {
      clearTimeout(this.timeout)
      delete this.timeout
    }
  }

  async flush() {
    try {
      this.lock()
    } catch (err) {
      this.shiftTimeout()
      return
    }

    try {
      this.clearTimeout()
      if (this.events.length > 0) {
        const flushedEvents = this.events
        this.events = []
        await this.flushed(flushedEvents)
      }
    } finally {
      this.unlock()
    }
  }

  switchMode(mode /*: EventBufferMode */) /*: void */ {
    this.clearTimeout()
    this.mode = mode
  }

  clear() /*: void */ {
    this.events = []
    this.clearTimeout()
  }
}

module.exports = EventBuffer
