/** Handling of events from the ChokidarWatcher initial scan.
 *
 * @module core/local/chokidar/initial_scan
 * @flow
 */

const chokidarEvent = require('./event')
const metadata = require('../../metadata')
const { logger } = require('../../utils/logger')
const { SYNC_DIR_EMPTY_MESSAGE } = require('../errors')

const log = logger({
  component: 'chokidar/initial_scan'
})

const NB_OF_DELETABLE_ELEMENT = 3

/*::
import type { ChokidarEvent } from './event'
import type LocalEventBuffer from './event_buffer'
import type { Pouch } from '../../pouch'
import type { SavedMetadata } from '../../metadata'

export type InitialScanParams = {
  paths: string[],
  emptyDirRetryCount: number,
  flushed: boolean,
  done: boolean,
  resolve?: () => void
}

export type InitialScanOpts = {
  buffer: LocalEventBuffer<ChokidarEvent>,
  initialScanParams: InitialScanParams,
  pouch: Pouch
}
*/

const detectOfflineUnlinkEvents = async (
  initialScanParams /*: InitialScanParams */,
  pouch /*: Pouch */
) /*: Promise<{offlineEvents: Array<ChokidarEvent>, unappliedMoves: string[], emptySyncDir: boolean}> */ => {
  // Try to detect removed files & folders
  const events /*: Array<ChokidarEvent> */ = []
  const docs /*: SavedMetadata[] */ = await pouch.initialScanDocs()
  const inInitialScan = doc =>
    initialScanParams.paths.indexOf(metadata.id(doc.path)) !== -1

  // the Syncdir is empty error only occurs if there was some docs beforehand
  let emptySyncDir = docs.length > NB_OF_DELETABLE_ELEMENT
  let unappliedMoves = []

  for (const doc of docs) {
    if (inInitialScan(doc) || doc.trashed || doc.incompatibilities) {
      emptySyncDir = false
    } else if (doc.moveFrom && inInitialScan(doc.moveFrom)) {
      // unapplied move
      unappliedMoves.push(metadata.id(doc.moveFrom.path))
    } else {
      log.debug('pretend unlink or unlinkDir', { path: doc.path })
      events.unshift(chokidarEvent.pretendUnlinkFromMetadata(doc))
    }
  }

  return { offlineEvents: events, unappliedMoves, emptySyncDir }
}

const step = async (
  rawEvents /*: ChokidarEvent[] */,
  { buffer, initialScanParams, pouch } /*: InitialScanOpts */
) /*: Promise<Array<ChokidarEvent>> */ => {
  // We mark the initial scan as flushed as soon as possible so latter events
  // are not marked as part of the initial scan.
  initialScanParams.flushed = true

  let events = rawEvents

  events
    .filter(e => e.type.startsWith('add'))
    .forEach(e => initialScanParams.paths.push(metadata.id(e.path)))

  const {
    offlineEvents,
    unappliedMoves,
    emptySyncDir
  } = await detectOfflineUnlinkEvents(initialScanParams, pouch)
  events = offlineEvents.concat(events)

  events = events.filter(e => {
    return unappliedMoves.indexOf(metadata.id(e.path)) === -1
  })

  if (emptySyncDir) {
    // it is possible this is a temporary faillure (too late mounting)
    // push back the events and wait until next flush.
    buffer.unflush(rawEvents)
    if (--initialScanParams.emptyDirRetryCount === 0) {
      throw new Error(SYNC_DIR_EMPTY_MESSAGE)
    }
    return []
  }

  log.debug('Done with initial scan', { initialEvents: events })
  return events
}

module.exports = {
  detectOfflineUnlinkEvents,
  step
}
