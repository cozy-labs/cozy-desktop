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

const Promise = require('bluebird')
const fse = require('fs-extra')
const path = require('path')

const metadata = require('../../metadata')
const logger = require('../../utils/logger')
const { sameDate, fromDate } = require('../../utils/timestamp')

/*::
import type { ChokidarEvent } from './event'
import type { InitialScan } from './initial_scan'
import type { LocalEvent } from './local_event'
import type { Metadata } from '../../metadata'
import type { Pouch } from '../../pouch'

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
  const old /*: ?Metadata */ = await pouch.byIdMaybeAsync(metadata.id(e.path))
  if (old && !old.deleted) return old
}

/**
 * Adds domain information on raw Chokidar events including associated existing
 * Metadata and normalized path.
 *
 * @return Promise<LocalEvent[]>
 */
const step = async (
  events /*: ChokidarEvent[] */,
  { checksum, initialScan, pouch, syncPath } /*: PrepareEventsOpts */
) /*: Promise<LocalEvent[]> */ => {
  const normalizedPaths = []

  return Promise.map(
    events,
    async (e /*: ChokidarEvent */) /*: Promise<?LocalEvent> */ => {
      const abspath = path.join(syncPath, e.path)

      const old = await oldMetadata(e, pouch)
      const eventPath = normalizedPath(e, old, normalizedPaths)
      normalizedPaths.push(eventPath)

      const e2 /*: Object */ = {
        ...e,
        path: eventPath,
        old
      }

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

const parentPathNormalized = (
  childPath /*: string */,
  normalizedPaths /*: string[] */
) /*: ?string */ =>
  normalizedPaths.find(
    p => p.normalize() === path.dirname(childPath).normalize()
  )

const isNFD = string => string === string.normalize('NFD')

const normalizedPath = (
  event /*: ChokidarEvent */,
  existing /*: ?Metadata */,
  normalizedPaths /*: string[] */
) /*: string */ => {
  if (existing != null && existing.path != null) {
    // Curent event's path parts
    const name = path.basename(event.path)
    const normalizedParentPath = parentPathNormalized(
      event.path,
      normalizedPaths
    )
    // Existing Pouch document's path parts
    const existingName = path.basename(existing.path)
    const existingParentPath = path.dirname(existing.path)

    if (isNFD(name) && !isNFD(existingName)) {
      const normalizedName = name.normalize('NFC')
      log.info(
        { path: event.path, existingPath: existing.path, normalizedName },
        'normalizing local NFD path to match existing NFC path'
      )

      // We expect the parent path to have been normalized via other events.
      // This might not be true if the parent's normalization hasn't been saved
      // to PouchDB yet.
      // So we look for a normalized parent path from a previous event and use
      // it or use the existing parent path otherwise.
      return normalizedParentPath
        ? path.join(normalizedParentPath, normalizedName)
        : existingParentPath != '.'
        ? path.join(existingParentPath, normalizedName)
        : normalizedName
    }
  }

  return event.path
}

module.exports = {
  oldMetadata,
  step
}
