/* @flow */

const Promise = require('bluebird')

module.exports = class Buffer /*:: <A> */ {
  /*::
  _resolve: ?Promise<A[]>
  _buffer: Array<A[]>
  */
  constructor () {
    this._resolve = null
    this._buffer = []
  }

  push (batch /*: A[] */) {
    if (this._resolve) {
      this._resolve(batch)
      this._resolve = null
    } else {
      this._buffer.push(batch)
    }
  }

  pop () /*: Promise<A[]> */ {
    if (this._buffer.length > 0) {
      const batch = this._buffer.shift()
      return Promise.resolve(batch)
    }
    return new Promise((resolve) => {
      this._resolve = resolve
    })
  }

  async forEach (fn /*: (A[]) => any */) {
    while (true) {
      fn(await this.pop())
    }
  }

  async doMap (fn /*: (A[]) => Array<*> */, buffer /*: Buffer<*> */) {
    while (true) {
      const batch = fn(await this.pop())
      buffer.push(batch)
    }
  }

  map (fn /*: (A[]) => Array<*> */) {
    const buffer = new Buffer/*:: <*> */()
    this.doMap(fn, buffer)
    return buffer
  }

  async doAsyncMap (fn /*: (A[]) => Promise<Array<*>> */, buffer /*: Buffer<*> */) {
    while (true) {
      const batch = await this.pop()
      const after = await fn(batch)
      buffer.push(after)
    }
  }

  asyncMap (fn /*: (A[]) => Promise<Array<*>> */) {
    const buffer = new Buffer/*:: <*> */()
    this.doAsyncMap(fn, buffer)
    return buffer
  }
}
