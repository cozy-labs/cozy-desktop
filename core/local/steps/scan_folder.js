/* @flow */

const logger = require('../../logger')

const STEP_NAME = 'scanFolder'

const log = logger({
  component: `atom/${STEP_NAME}`
})

/*::
import type Buffer from './buffer'
import type { Scanner } from './producer'
*/

module.exports = {
  loop
}

// When a directory that was not in the synchronized dir is moved to it,
// atom/Watcher emits a single event for the added directory. In this step,
// when this happens, we scan the directory to see if it contains files and
// sub-directories.
function loop(
  buffer /*: Buffer */,
  opts /*: { scan: Scanner } */
) /*: Buffer */ {
  return buffer.asyncMap(async batch => {
    for (const event of batch) {
      if (event.incomplete) {
        continue
      }
      if (event.action === 'created' && event.kind === 'directory') {
        opts.scan(event.path).catch(err => {
          log.error({ err, event }, 'Error on scan')
        })
      }
    }
    return batch
  })
}
