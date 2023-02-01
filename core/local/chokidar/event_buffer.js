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
    this.events = []
    this.mode = 'idle'
    this.timeoutInMs = timeoutInMs
    this.timeout = null
    this.flushed = flushed

    autoBind(this)
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
    this.clearTimeout()
    if (this.events.length > 0) {
      const flushedEvents = this.events
      this.events = []
      return this.flushed(flushedEvents)
    }
  }

  switchMode(mode /*: EventBufferMode */) /*: void */ {
    this.flush()
    this.mode = mode
  }

  clear() /*: void */ {
    this.events = []
    this.clearTimeout()
  }
}

module.exports = EventBuffer
