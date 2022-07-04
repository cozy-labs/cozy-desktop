/** This step makes sure added directories are effectively scanned.
 *
 * When a directory that was not in the synchronized dir is moved to it,
 * atom/Watcher emits a single event for the added directory. In this step,
 * when this happens, we scan the directory to see if it contains files and
 * sub-directories.
 *
 * @module core/local/channel_watcher/scan_folder
 * @flow
 */

const logger = require('../../utils/logger')

const STEP_NAME = 'scanFolder'

const log = logger({
  component: `ChannelWatcher/${STEP_NAME}`
})

/*::
import type Channel from './channel'
import type { Scanner } from './producer'
*/

module.exports = {
  loop
}

function loop(
  channel /*: Channel */,
  opts /*: { scan: Scanner } */
) /*: Channel */ {
  return channel.asyncMap(async batch => {
    for (const event of batch) {
      if (event.incomplete) {
        continue
      }
      if (event.action === 'created' && event.kind === 'directory') {
        opts.scan(event.path).catch(err => {
          log.warn({ err, event }, 'Error on folder scan')
        })
      }
    }
    return batch
  })
}
