/* @flow */

const logger = require('../../logger')
const log = logger({
  component: 'scanFolder'
})

/*::
import type Buffer from './buffer'
import type { Producer } from './producer'
*/

// When a directory that was not in the synchronized dir is moved to it,
// atom/Watcher emits a single event for the added directory. In this step,
// when this happens, we scan the directory to see if it contains files and
// sub-directories.
module.exports = function (buffer /*: Buffer */, opts /*: { producer: Producer } */) /*: Buffer */ {
  return buffer.asyncMap(async (batch) => {
    for (const event of batch) {
      if (event.incomplete) {
        continue
      }
      if (event.action === 'created' && event.kind === 'directory') {
        opts.producer.scan(event.path)
          .catch((err) => log.info({err, event}, 'Error on scan'))
      }
    }
    return batch
  })
}
