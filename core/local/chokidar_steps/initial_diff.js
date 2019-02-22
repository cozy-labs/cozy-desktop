/* @flow */

const chokidarEvent = require('../chokidar_event')
const logger = require('../../logger')
const metadata = require('../../metadata')

/*::
import type { ChokidarEvent } from '../chokidar_event'
import type EventBuffer from '../event_buffer'
import type { InitialScan } from './initial_scan'
import type Pouch from '../../pouch'
*/

const log = logger({
  component: 'ChokidarInitialDiff'
})
log.chokidar = log.child({
  component: 'Chokidar'
})

module.exports = {
  step,
  detectOfflineUnlinkEvents
}

/*::
export type ChokidarInitialDiffOptions = {
  buffer: EventBuffer<ChokidarEvent>,
  initialScan: ?InitialScan,
  pouch: Pouch
}
*/

async function step (rawEvents /*: ChokidarEvent[] */, {buffer, initialScan, pouch} /*: ChokidarInitialDiffOptions */) /*: Promise<?Array<ChokidarEvent>> */ {
  let events = rawEvents.filter((e) => e.path !== '') // @TODO handle root dir events
  if (initialScan != null) {
    const ids = initialScan.ids
    events.filter((e) => e.type.startsWith('add'))
          .forEach((e) => ids.push(metadata.id(e.path)))

    const {offlineEvents, unappliedMoves, emptySyncDir} = await detectOfflineUnlinkEvents(initialScan, pouch)
    events = offlineEvents.concat(events)

    events = events.filter((e) => {
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

    log.debug({initialEvents: events})
  }
  return events
}

const NB_OF_DELETABLE_ELEMENT = 3

async function detectOfflineUnlinkEvents (initialScan /*: InitialScan */, pouch /*: Pouch */) /*: Promise<{offlineEvents: Array<ChokidarEvent>, unappliedMoves: *, emptySyncDir: boolean}> */ {
  // Try to detect removed files & folders
  const events /*: Array<ChokidarEvent> */ = []
  const docs = await pouch.byRecursivePathAsync('')
  const inInitialScan = (doc) =>
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
      log.chokidar.debug({path: doc.path}, 'pretend unlink or unlinkDir')
      events.unshift(chokidarEvent.pretendUnlinkFromMetadata(doc))
    }
  }

  return {offlineEvents: events, unappliedMoves, emptySyncDir}
}
