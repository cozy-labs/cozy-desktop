/* @flow */

const Promise = require('bluebird')

/*::
import type { Batch } from './event'
*/

// Channel is a data structure for propagating batches of events from a FS
// watcher to the Pouch database, via several steps. It's expected that we have
// only one class/function that pushes in the channel, and only one
// class/function that takes batches from the channel.
module.exports = class Channel {
  /*::
  _resolve: ?Promise<Batch>
  _buffer: Array<Batch>
  */
  constructor() {
    this._resolve = null
    this._buffer = []
  }

  push(batch /*: Batch */) /*: void */ {
    if (batch.length === 0) return

    if (this._resolve) {
      this._resolve(batch)
      this._resolve = null
    } else {
      this._buffer.push(batch)
    }
  }

  pop() /*: Promise<Batch> */ {
    if (this._buffer.length > 0) {
      const batch = this._buffer.shift()
      return Promise.resolve(batch)
    }
    return new Promise(resolve => {
      this._resolve = resolve
    })
  }

  async doMap(
    fn /*: (Batch) => Batch */,
    channel /*: Channel */
  ) /*: Promise<void> */ {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = fn(await this.pop())
      channel.push(batch)
    }
  }

  map(fn /*: (Batch) => Batch */) /*: Channel */ {
    const channel = new Channel()
    this.doMap(fn, channel)
    return channel
  }

  async doAsyncMap(
    fn /*: (Batch) => Promise<Batch> */,
    channel /*: Channel */
  ) /*: Promise<void> */ {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await this.pop()
      const after = await fn(batch)
      channel.push(after)
    }
  }

  asyncMap(fn /*: (Batch) => Promise<Batch> */) /*: Channel */ {
    const channel = new Channel()
    this.doAsyncMap(fn, channel)
    return channel
  }
}
