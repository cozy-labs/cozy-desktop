/* @flow */

/*::
import type Buffer from './buffer'
*/

module.exports = function (buffer /*: Buffer */, opts /*: {} */) {
  buffer.forEach((batch) => {
    console.log('dispatch', batch)
  })
}
