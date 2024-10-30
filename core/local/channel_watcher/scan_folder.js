/** This step makes sure added directories are effectively scanned.
 *
 * When a directory that was not in the synchronized dir is moved to it,
 * @parcel/watcher emits a single event for the added directory. In this step,
 * when this happens, we scan the directory to see if it contains files and
 * sub-directories.
 *
 * @module core/local/channel_watcher/scan_folder
 * @flow
 */

const { logger } = require('../../utils/logger')
const { measureTime } = require('../../utils/perfs')

const STEP_NAME = 'scanFolder'

const log = logger({
  component: `ChannelWatcher/${STEP_NAME}`
})

/*::
import type Channel from './channel'
import type { Scanner } from './parcel_producer'
*/

module.exports = {
  loop
}

function loop(
  channel /*: Channel */,
  opts /*: { scan: Scanner, fatal: Error => any } */
) /*: Channel */ {
  return channel.asyncMap(async batch => {
    const stopMeasure = measureTime('LocalWatcher#scanFolderStep')

    for (const event of batch) {
      if (event.incomplete) {
        continue
      }
      if (event.action === 'created' && event.kind === 'directory') {
        opts.scan(event.path).catch(err => {
          log.error('Error on folder scan', { err, event })
        })
      }
    }

    stopMeasure()
    return batch
  }, opts.fatal)
}
