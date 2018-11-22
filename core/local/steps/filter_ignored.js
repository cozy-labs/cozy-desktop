/* @flow */

/*::
import type Buffer from './buffer'
import type { Ignore } from '../../ignore'
*/

module.exports = function (buffer /*: Buffer */, opts /*: { ignore: Ignore } */) /*: Buffer */ {
  return buffer.map((batch) => {
    // $FlowFixMe
    return batch.filter(event => opts.ignore.isIgnored(event))
  })
}
