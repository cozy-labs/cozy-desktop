/* Dispatch takes a Channel of AtomEvent batches and calls Prep for each event.
 *
 * It needs to fetch the old documents from pouchdb in some cases to have all
 * the data expected by prep/merge.
 *
 * @module core/local/atom/dispatch
 * @flow
 */

const _ = require('lodash')

const winDetectMove = require('./win_detect_move')
const { buildDir, buildFile, id } = require('../../metadata')
const logger = require('../../utils/logger')

const STEP_NAME = 'dispatch'
const component = `atom/${STEP_NAME}`

const log = logger({
  component
})

/*::
import type Channel from './channel'
import type {
  AtomEvent,
  AtomBatch
} from './event'
import type { WinDetectMoveState } from './win_detect_move'
import type EventEmitter from 'events'
import type Prep from '../../prep'
import type { Pouch } from '../../pouch'

export type AtomEventsDispatcher = (AtomBatch) => Promise<AtomBatch>

type DispatchOptions = {
  events: EventEmitter,
  prep: Prep,
  pouch: Pouch,
  state: WinDetectMoveState,
  onAtomEvents?: AtomEventsDispatcher
}
*/

const SIDE = 'local'
let actions

module.exports = {
  loop,
  step
}

function loop(
  channel /*: Channel */,
  opts /*: DispatchOptions */
) /*: Channel */ {
  return channel.asyncMap(opts.onAtomEvents || step(opts))
}

function step(opts /*: DispatchOptions */) {
  return async (batch /*: AtomBatch */) => {
    opts.events.emit('local-start')
    for (const event of batch) {
      try {
        await dispatchEvent(event, opts)
        let target = -1
        try {
          target = (await opts.pouch.db.changes({ limit: 1, descending: true }))
            .last_seq
        } catch (err) {
          log.warn({ err })
          /* ignore err */
        }
        opts.events.emit('sync-target', target)
      } catch (err) {
        log.error({ err, event })
      } finally {
        if (process.platform === 'win32') {
          winDetectMove.forget(event, opts.state)
        }
      }
    }
    opts.events.emit('local-end')
    return batch
  }
}

async function dispatchEvent(
  event /*: AtomEvent */,
  opts /*: DispatchOptions */
) {
  log.trace({ event }, 'dispatch')
  if (event.action === 'initial-scan-done') {
    actions.initialScanDone(opts)
  } else if (event.action === 'ignored') {
    actions.ignored(event)
  } else {
    // Lock to prevent Merge/Sync conflicts
    const release = await opts.pouch.lock(component)
    try {
      await actions[event.action + event.kind](event, opts)
    } finally {
      release()
    }
  }
}

actions = {
  initialScanDone: ({ events }) => {
    log.info('Initial scan done')
    events.emit('initial-scan-done')
  },

  ignored: event => {
    log.debug({ event }, 'Ignored')
  },

  scanfile: (event, opts) => actions.createdfile(event, opts, 'File found'),

  scandirectory: (event, opts) =>
    actions.createddirectory(event, opts, 'Dir found'),

  createdfile: async (event, { prep }, description = 'File added') => {
    log.info({ event }, description)
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await prep.addFileAsync(SIDE, doc)
  },

  createddirectory: async (event, { prep }, description = 'Dir added') => {
    log.info({ event }, description)
    const doc = buildDir(event.path, event.stats)
    await prep.putFolderAsync(SIDE, doc)
  },

  modifiedfile: async (event, { prep }) => {
    log.info({ event }, 'File modified')
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await prep.updateFileAsync(SIDE, doc)
  },

  modifieddirectory: async (event, { prep }) => {
    log.info({ event }, 'Dir modified')
    const doc = buildDir(event.path, event.stats)
    await prep.putFolderAsync(SIDE, doc)
  },

  renamedfile: async (event, { pouch, prep }) => {
    const was = await pouch.byIdMaybeAsync(id(event.oldPath))
    // If was is marked for deletion, we'll transform it into a move.
    if (!was) {
      // A renamed event where the source does not exist can be seen as just an
      // add. It can happen on Linux when a file is added when the client is
      // stopped, and is moved before it was scanned.
      _.set(event, [STEP_NAME, 'originalEvent'], _.clone(event))
      event.action = 'created'
      delete event.oldPath
      return actions.createdfile(event, { prep }, 'File moved, assuming added')
    } else if (was.ino !== event.stats.ino) {
      _.set(event, [STEP_NAME, 'moveSrcReplacement'], _.clone(was))
      log.warn({ event }, 'File move source has been replaced in Pouch')
      return
    }
    log.info({ event }, 'File moved')

    const doc = buildFile(event.path, event.stats, event.md5sum)
    if (event.overwrite) {
      const existing = await pouch.byIdMaybeAsync(id(event.path))
      doc.overwrite = existing
    }

    await prep.moveFileAsync(SIDE, doc, was)
  },

  renameddirectory: async (event, { pouch, prep }) => {
    const was = await pouch.byIdMaybeAsync(id(event.oldPath))
    // If was is marked for deletion, we'll transform it into a move.
    if (!was) {
      // A renamed event where the source does not exist can be seen as just an
      // add. It can happen on Linux when a dir is added when the client is
      // stopped, and is moved before it was scanned.
      _.set(event, [STEP_NAME, 'originalEvent'], _.clone(event))
      event.action = 'created'
      delete event.oldPath
      return actions.createddirectory(
        event,
        { prep },
        'Dir moved, assuming added'
      )
    } else if (was.ino !== event.stats.ino) {
      _.set(event, [STEP_NAME, 'moveSrcReplacement'], _.clone(was))
      log.warn({ event }, 'File move source has been replaced in Pouch')
      return
    }
    log.info({ event }, 'Dir moved')

    const doc = buildDir(event.path, event.stats)
    if (event.overwrite) {
      const existing = await pouch.byIdMaybeAsync(id(event.path))
      doc.overwrite = existing
    }

    await prep.moveFolderAsync(SIDE, doc, was)
  },

  deletedfile: async (event, { pouch, prep }) => {
    const was = await pouch.byIdMaybeAsync(event._id)
    if (!was || was.deleted) {
      log.debug({ event }, 'Assuming file already removed')
      // The file was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    log.info({ event }, 'File removed')
    await prep.trashFileAsync(SIDE, was)
  },

  deleteddirectory: async (event, { pouch, prep }) => {
    const was = await pouch.byIdMaybeAsync(event._id)
    if (!was || was.deleted) {
      log.debug({ event }, 'Assuming dir already removed')
      // The dir was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    log.info({ event }, 'Dir removed')
    await prep.trashFolderAsync(SIDE, was)
  }
}
