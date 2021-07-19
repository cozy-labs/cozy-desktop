/* @flow */

const { Readable } = require('stream')
const crypto = require('crypto')

module.exports = class ChecksumBuilder {
  /*::
  data: string | Buffer | Readable
  */

  constructor(data /*: string | Buffer | Readable */) {
    this.data = data
  }

  build() /*: string */ {
    const { data } = this
    if (data instanceof Readable) {
      throw new Error(
        'build() can only be called with String data as we will not await a Stream reading'
      )
    } else {
      return crypto
        .createHash('md5')
        .update(data)
        .digest()
        .toString('base64')
    }
  }

  async create() /*: Promise<string> */ {
    if (this.data instanceof Readable) {
      const stream = this.data
      const checksum = crypto.createHash('md5')
      checksum.setEncoding('base64')

      return new Promise((resolve, reject) => {
        stream.on('end', function() {
          checksum.end()
          resolve(String(checksum.read()))
        })
        stream.on('error', function(err) {
          checksum.end()
          reject(err)
        })
        stream.pipe(checksum)
      })
    } else {
      return this.build()
    }
  }
}
