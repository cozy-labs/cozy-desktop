/** Handling of events from the ChokidarWatcher initial scan.
 *
 * @module core/local/chokidar/initial_scan
 * @flow
 */

const chokidarEvent = require('./event')
const logger = require('../../utils/logger')
const metadata = require('../../metadata')

const log = logger({
  component: 'chokidar/initial_scan'
})

const NB_OF_DELETABLE_ELEMENT = 3

/*::
import type { ChokidarEvent } from './event'
import type LocalEventBuffer from './event_buffer'
import type { Pouch } from '../../pouch'

export type InitialScan = {
  ids: string[],
  emptyDirRetryCount: number,
  flushed: boolean,
  resolve: () => void
}

export type InitialScanOpts = {
  buffer: LocalEventBuffer<ChokidarEvent>,
  initialScan: ?InitialScan,
  pouch: Pouch
}
*/

const detectOfflineUnlinkEvents = async (
  initialScan /*: InitialScan */,
  pouch /*: Pouch */
) /*: Promise<{offlineEvents: Array<ChokidarEvent>, unappliedMoves: string[], emptySyncDir: boolean}> */ => {
  // Try to detect removed files & folders
  const events /*: Array<ChokidarEvent> */ = []
  const docs = await pouch.byRecursivePathAsync('')
  const inInitialScan = doc =>
    initialScan.ids.indexOf(metadata.id(doc.path)) !== -1

  // the Syncdir is empty error only occurs if there was some docs beforehand
  let emptySyncDir = docs.length > NB_OF_DELETABLE_ELEMENT
  let unappliedMoves = []

  for (const doc of docs) {
    if (inInitialScan(doc) || doc.trashed || doc.incompatibilities) {
      emptySyncDir = false
    } else if (doc.moveFrom) {
      // unapplied move
      unappliedMoves.push(metadata.id(doc.moveFrom.path))
    } else {
      log.debug({ path: doc.path }, 'pretend unlink or unlinkDir')
      events.unshift(chokidarEvent.pretendUnlinkFromMetadata(doc))
    }
  }

  return { offlineEvents: events, unappliedMoves, emptySyncDir }
}

const step = async (
  rawEvents /*: ChokidarEvent[] */,
  { buffer, initialScan, pouch } /*: InitialScanOpts */
) /*: Promise<?Array<ChokidarEvent>> */ => {
  let events = rawEvents.filter(e => e.path !== '') // @TODO handle root dir events
  if (initialScan != null) {
    const ids = initialScan.ids
    events
      .filter(e => e.type.startsWith('add'))
      .forEach(e => ids.push(metadata.id(e.path)))

    const {
      offlineEvents,
      unappliedMoves,
      emptySyncDir
    } = await detectOfflineUnlinkEvents(initialScan, pouch)
    events = offlineEvents.concat(events)

    events = events.filter(e => {
      return unappliedMoves.indexOf(metadata.id(e.path)) === -1
    })

    if (emptySyncDir) {
      // it is possible this is a temporary faillure (too late mounting)
      // push back the events and wait until next flush.
      buffer.unflush(rawEvents)
      if (--initialScan.emptyDirRetryCount === 0) {
        throw new Error('Syncdir is empty')
      }
      return initialScan.resolve()
    }

    log.debug({ initialEvents: events })
  }

  return events
}

module.exports = {
  detectOfflineUnlinkEvents,
  step
}
