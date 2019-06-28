/** Add context to ChokidarEvents, turning them into LocalEvents.
 *
 * @module core/local/chokidar/prepare_events
 * @flow
 */

const Promise = require('bluebird')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')

const metadata = require('../../metadata')
const logger = require('../../utils/logger')
const { sameDate, fromDate } = require('../../utils/timestamp')

/*::
import type { ChokidarEvent } from './event'
import type { InitialScan } from './initial_scan'
import type { LocalEvent } from './local_event'
import type { Metadata } from '../../metadata'
import type Pouch from '../../pouch'

type PrepareEventsOpts = {
  +checksum: (string) => Promise<string>,
  initialScan: ?InitialScan,
  pouch: Pouch,
  syncPath: string
}
*/

const log = logger({
  component: 'chokidar/prepare_events'
})

const oldMetadata = async (
  e /*: ChokidarEvent */,
  pouch /*: Pouch */
) /*: Promise<?Metadata> */ => {
  if (e.old) return e.old
  try {
    return await pouch.db.get(metadata.id(e.path))
  } catch (err) {
    if (err.status !== 404) log.error({ path: e.path, err })
  }
  return null
}

const step = async (
  events /*: ChokidarEvent[] */,
  { checksum, initialScan, pouch, syncPath } /*: PrepareEventsOpts */
) /*: Promise<LocalEvent[]> */ => {
  return Promise.map(
    events,
    async (e /*: ChokidarEvent */) /*: Promise<?LocalEvent> */ => {
      const abspath = path.join(syncPath, e.path)

      const e2 /*: Object */ = _.merge(
        {
          old: await oldMetadata(e, pouch)
        },
        e
      )

      if (e.type === 'add' || e.type === 'change') {
        if (
          initialScan &&
          e2.old &&
          e2.path === e2.old.path &&
          sameDate(fromDate(e2.old.updated_at), fromDate(e2.stats.mtime))
        ) {
          log.trace(
            { path: e.path },
            'Do not compute checksum : mtime & path are unchanged'
          )
          e2.md5sum = e2.old.md5sum
        } else {
          try {
            e2.md5sum = await checksum(e.path)
            log.trace({ path: e.path, md5sum: e2.md5sum }, 'Checksum complete')
          } catch (err) {
            // FIXME: err.code === EISDIR => keep the event? (e.g. rm foo && mkdir foo)
            // Chokidar reports a change event when a file is replaced by a directory
            if (err.code.match(/ENOENT/)) {
              log.debug(
                { path: e.path, ino: e.stats.ino },
                'Checksum failed: file does not exist anymore'
              )
              e2.wip = true
            } else {
              log.error({ path: e.path, err }, 'Checksum failed')
              return null
            }
          }
        }
      }

      if (e.type === 'addDir') {
        if (!(await fse.exists(abspath))) {
          log.debug(
            { path: e.path, ino: e.stats.ino },
            'Dir does not exist anymore'
          )
          e2.wip = true
        }
      }

      return e2
    },
    { concurrency: 50 }
  ).filter((e /*: ?LocalEvent */) => e != null)
}

module.exports = {
  oldMetadata,
  step
}
