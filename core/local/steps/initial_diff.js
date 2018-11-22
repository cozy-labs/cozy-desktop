/* @flow */

/*::
import type Buffer from './buffer'
*/

module.exports = function (buffer /*: Buffer */, opts /*: {} */) /*: Buffer */ {
  return buffer.map((batch) => {
    console.log('initial_diff', batch.length)
    return batch
  })
}
