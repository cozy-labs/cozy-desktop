/* @flow */

const stream = require('stream')

module.exports = class StreamBuilder {
  /*::
  data: string
  err: ?Error
  */

  constructor() {
    this.data = ''
    this.err = null
  }

  push(data /*: string */) /*: StreamBuilder */ {
    this.data += data
    return this
  }

  error(err /*: Error */) /* StreamBuilder */ {
    this.err = err
    return this
  }

  build() /*: stream.Readable */ {
    const builder = this
    return new stream.Readable({
      read: function() {
        if (builder.err) {
          this.emit('error', builder.err)
        } else {
          this.push(builder.data)
          this.push(null)
        }
      }
    })
  }
}
