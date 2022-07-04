/**
 * @module core/local/channel_watcher/channel
 * @flow
 */

const Promise = require('bluebird')

/*::
import type { ChannelBatch } from './event'
*/

/**
 * Channel is a data structure for propagating batches of events from a FS
 * watcher to the Pouch database, via several steps. It's expected that we have
 * only one class/function that pushes in the channel, and only one
 * class/function that takes batches from the channel.
 */
class Channel {
  /*::
  _resolve: ?Promise<ChannelBatch>
  _buffer: Array<ChannelBatch>
  */
  constructor() {
    this._resolve = null
    this._buffer = []
  }

  push(batch /*: ChannelBatch */) /*: void */ {
    if (batch.length === 0) return

    if (this._resolve) {
      this._resolve(batch)
      this._resolve = null
    } else {
      this._buffer.push(batch)
    }
  }

  pop() /*: Promise<ChannelBatch> */ {
    if (this._buffer.length > 0) {
      const batch = this._buffer.shift()
      return Promise.resolve(batch)
    }
    return new Promise(resolve => {
      this._resolve = resolve
    })
  }

  async doMap(
    fn /*: (ChannelBatch) => ChannelBatch */,
    channel /*: Channel */
  ) /*: Promise<void> */ {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = fn(await this.pop())
      channel.push(batch)
    }
  }

  map(fn /*: (ChannelBatch) => ChannelBatch */) /*: Channel */ {
    const channel = new Channel()
    this.doMap(fn, channel)
    return channel
  }

  async doAsyncMap(
    fn /*: (ChannelBatch) => Promise<ChannelBatch> */,
    channel /*: Channel */
  ) /*: Promise<void> */ {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await this.pop()
      const after = await fn(batch)
      channel.push(after)
    }
  }

  asyncMap(fn /*: (ChannelBatch) => Promise<ChannelBatch> */) /*: Channel */ {
    const channel = new Channel()
    this.doAsyncMap(fn, channel)
    return channel
  }
}

module.exports = Channel
