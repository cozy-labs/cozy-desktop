/**
 * @module core/local/atom/channel
 * @flow
 */

const Promise = require('bluebird')

/*::
import type { AtomBatch } from './event'
*/

/**
 * Channel is a data structure for propagating batches of events from a FS
 * watcher to the Pouch database, via several steps. It's expected that we have
 * only one class/function that pushes in the channel, and only one
 * class/function that takes batches from the channel.
 */
class Channel {
  /*::
  _resolve: ?Promise<AtomBatch>
  _buffer: Array<AtomBatch>
  */
  constructor() {
    this._resolve = null
    this._buffer = []
  }

  push(batch /*: AtomBatch */) /*: void */ {
    if (batch.length === 0) return

    if (this._resolve) {
      this._resolve(batch)
      this._resolve = null
    } else {
      this._buffer.push(batch)
    }
  }

  pop() /*: Promise<AtomBatch> */ {
    if (this._buffer.length > 0) {
      const batch = this._buffer.shift()
      return Promise.resolve(batch)
    }
    return new Promise(resolve => {
      this._resolve = resolve
    })
  }

  async doMap(
    fn /*: (AtomBatch) => AtomBatch */,
    channel /*: Channel */
  ) /*: Promise<void> */ {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = fn(await this.pop())
      channel.push(batch)
    }
  }

  map(fn /*: (AtomBatch) => AtomBatch */) /*: Channel */ {
    const channel = new Channel()
    this.doMap(fn, channel)
    return channel
  }

  async doAsyncMap(
    fn /*: (AtomBatch) => Promise<AtomBatch> */,
    channel /*: Channel */
  ) /*: Promise<void> */ {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await this.pop()
      const after = await fn(batch)
      channel.push(after)
    }
  }

  asyncMap(fn /*: (AtomBatch) => Promise<AtomBatch> */) /*: Channel */ {
    const channel = new Channel()
    this.doAsyncMap(fn, channel)
    return channel
  }
}

module.exports = Channel
