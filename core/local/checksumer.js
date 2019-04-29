/* @flow */

const Promise = require('bluebird')
const async = require('async')
const crypto = require('crypto')
const fs = require('fs')
const measureTime = require('../perftools')

/*::
import type { Callback } from '../utils/func'
*/

module.exports = {
  computeChecksum,
  computeChecksumAsync: Promise.promisify(computeChecksum),
  init
}

// Get checksum for given file
function computeChecksum(filePath /*: string */, callback /*: Callback */) {
  const stopMeasure = measureTime('LocalWatcher#checksumer')
  const stream = fs.createReadStream(filePath)
  const checksum = crypto.createHash('md5')
  checksum.setEncoding('base64')
  stream.on('end', function() {
    stopMeasure()
    checksum.end()
    callback(null, checksum.read())
  })
  stream.on('error', function(err) {
    stopMeasure()
    checksum.end()
    callback(err)
  })
  stream.pipe(checksum)
}

const retryComputeChecksum = (
  filePath /*: string */,
  callback /*: Callback */
) => {
  async.retry(
    {
      times: 5,
      // retry after 1, 2, 4, 8, 16 seconds
      interval: count => 500 * Math.pow(2, count),
      errorFilter: err => err.code === 'EBUSY'
    },
    cb => {
      computeChecksum(filePath, cb)
    },
    callback
  )
}

/*::
export type Checksumer = {
  push: (filePath: string) => Promise<string>,
  kill: () => void
}
*/

function init() /*: Checksumer */ {
  // Use a queue for checksums to avoid computing many checksums at the
  // same time. It's better for performance (hard disk are faster with
  // linear readings).
  const queue = Promise.promisifyAll(async.queue(retryComputeChecksum))

  return {
    push(filePath /*: string */) /*: Promise<string> */ {
      return queue.pushAsync(filePath)
    },

    kill: queue.kill
  }
}
