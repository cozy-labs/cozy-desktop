/* @flow */

const stream = require('stream')

module.exports = class StreamBuilder {
  /*::
  data: string
  */

  constructor() {
    this.data = ''
  }

  push(data /*: string */) /*: StreamBuilder */ {
    this.data += data
    return this
  }

  build() /*: stream.Readable */ {
    const result = new stream.Readable()

    result.push(this.data)
    result.push(null)

    return result
  }
}
