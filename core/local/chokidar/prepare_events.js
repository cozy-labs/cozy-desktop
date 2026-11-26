/** Add context to ChokidarEvents, turning them into LocalEvents.
 *
 * When applying remote changes on the local filesystem for paths containing
 * utf8 characters, the encoding can be automatically and silently modified by
 * the filesystem itself. For example, HFS+ volumes will normalize UTF-8
 * characters using NFD
 * (c.f. {@link https://en.wikipedia.org/wiki/Unicode_equivalence#Normalization}).
 *
 * When this happens, the local watcher will fire events for paths which aren't
 * exactly equal to the ones that were merged from the remote changes, leading
 * to the detection of a move which will then be synchronized with the remote
 * and so on.
 *
 * To avoid those "leaks" which can create conflicts or at least extraneous
 * changes on existing documents, we normalize on the fly the event's path
 * using NFC so we won't detect movements when only the encoding has changed.
 *
 * @see method {@link oldMetadata} for existing Metadata path normalization
 * @see method {@link step} for current events path normalization
 * @see {@link module:core/metadata|Metadata#idApfsOrHfs} for id normalization
 *
 * @module core/local/chokidar/prepare_events
 * @flow
 *
 */

const path = require('path')

const Promise = require('bluebird')
const fse = require('fs-extra')

const { logger } = require('../../utils/logger')

/*::
import type { ChokidarEvent } from './event'
import type { InitialScanParams } from './initial_scan'
import type { LocalEvent } from './local_event'
import type { Metadata } from '../../metadata'
import type { Pouch } from '../../pouch'

type PrepareEventsOpts = {
  +checksum: (string) => Promise<string>,
  initialScanParams: InitialScanParams,
  pouch: Pouch,
  syncPath: string
}
*/

const log = logger({
  component: 'chokidar/prepare_events'
})

/**
 * Returns the Metadata stored in Pouch associated with the given event's path.
 *
 * @return Metadata
 */
const oldMetadata = async (
  e /*: ChokidarEvent */,
  pouch /*: Pouch */
) /*: Promise<?Metadata> */ => {
  if (e.old) return e.old
  const old /*: ?Metadata */ = await pouch.bySyncedPath(e.path)
  if (old && !old.trashed) return old
}

/**
 * Tells whether the file described by the given Metadata is still on disk at
 * the given path.
 *
 * The inode is not enough: on a case insensitive filesystem, a file renamed
 * with a different case can still be reached through its old path. We thus
 * make sure its parent has an entry with this exact name.
 *
 * @return Promise<boolean>
 */
const isStillOnDisk = async (
  abspath /*: string */,
  old /*: Metadata */
) /*: Promise<boolean> */ => {
  try {
    const stats = await fse.stat(abspath)
    if (stats.ino !== old.ino) return false

    const names = await fse.readdir(path.dirname(abspath))
    return names.includes(path.basename(abspath))
  } catch (err) {
    return false
  }
}

/**
 * Adds domain information on raw Chokidar events including associated existing
 * Metadata and normalized path.
 *
 * @return Promise<LocalEvent[]>
 */
const step = async (
  events /*: ChokidarEvent[] */,
  { checksum, initialScanParams, pouch, syncPath } /*: PrepareEventsOpts */
) /*: Promise<LocalEvent[]> */ => {
  return Promise.map(
    events,
    async (e /*: ChokidarEvent */) /*: Promise<?LocalEvent> */ => {
      const abspath = path.join(syncPath, e.path)

      const old = await oldMetadata(e, pouch)
      const e2 /*: Object */ = {
        ...e,
        old
      }

      if (e.type === 'add' || e.type === 'change') {
        if (
          initialScanParams && // FIXME: remove this line so we don't recompute unnecessary checksumss after thee initial scan
          e2.old &&
          e2.path.normalize() === e2.old.path.normalize() &&
          e2.old.local &&
          e2.old.local.md5sum &&
          new Date(e2.old.local.updated_at).getTime() ===
            e2.stats.mtime.getTime()
        ) {
          log.trace('Do not compute checksum : mtime & path are unchanged', {
            path: e.path
          })
          e2.md5sum = e2.old.local.md5sum
        } else {
          try {
            e2.md5sum = await checksum(e.path)
            log.trace('Checksum complete', { path: e.path, md5sum: e2.md5sum })
          } catch (err) {
            // FIXME: err.code === EISDIR => keep the event? (e.g. rm foo && mkdir foo)
            // Chokidar reports a change event when a file is replaced by a directory
            if (err.code.match(/ENOENT/)) {
              log.debug('Checksum failed: file does not exist anymore', {
                path: e.path,
                ino: e.stats.ino
              })
              e2.wip = true
            } else {
              log.error('Checksum failed', { path: e.path, err, sentry: true })
              return null
            }
          }
        }
      }

      if (e.type === 'unlink' && old && old.ino) {
        // The record is looked up by path when the events are flushed. If
        // the path was freed then taken by another file in the meantime
        // (e.g. a remote move followed by the download of a new file), the
        // event is about a file which is not the one described by the record.
        if (await isStillOnDisk(abspath, old)) {
          log.debug('Ignore unlink: file is still on disk', {
            path: e.path,
            ino: old.ino
          })
          return null
        }
      }

      if (e.type === 'addDir') {
        if (!(await fse.exists(abspath))) {
          log.debug('Dir does not exist anymore', {
            path: e.path,
            ino: e.stats.ino
          })
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
