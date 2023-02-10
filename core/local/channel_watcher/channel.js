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
    channel /*: Channel */,
    notifyErr /*: Error => any */
  ) /*: Promise<void> */ {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const batch = fn(await this.pop())
        channel.push(batch)
      } catch (err) {
        notifyErr(err)
      }
    }
  }

  map(
    fn /*: (ChannelBatch) => ChannelBatch */,
    notifyErr /*: Error => any */
  ) /*: Channel */ {
    const channel = new Channel()
    this.doMap(fn, channel, notifyErr)
    return channel
  }

  async doAsyncMap(
    fn /*: (ChannelBatch) => Promise<ChannelBatch> */,
    channel /*: Channel */,
    notifyErr /*: Error => any */
  ) /*: Promise<void> */ {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const batch = await this.pop()
        const after = await fn(batch)
        channel.push(after)
      } catch (err) {
        notifyErr(err)
      }
    }
  }

  asyncMap(
    fn /*: (ChannelBatch) => Promise<ChannelBatch> */,
    notifyErr /*: Error => any */
  ) /*: Channel */ {
    const channel = new Channel()
    this.doAsyncMap(fn, channel, notifyErr)
    return channel
  }
}

module.exports = Channel
