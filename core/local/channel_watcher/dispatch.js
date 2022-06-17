/* Dispatch takes a Channel of ChannelEvent batches and calls Prep for each event.
 *
 * It needs to fetch the old documents from pouchdb in some cases to have all
 * the data expected by prep/merge.
 *
 * @module core/local/channel_watcher/dispatch
 * @flow
 */

const _ = require('lodash')

const { buildDir, buildFile } = require('../../metadata')
const { WINDOWS_DATE_MIGRATION_FLAG } = require('../../config')
const logger = require('../../utils/logger')

const STEP_NAME = 'dispatch'
const component = `ChannelWatcher/${STEP_NAME}`

const log = logger({
  component
})

/*::
import type Channel from './channel'
import type {
  ChannelEvent,
  ChannelBatch
} from './event'
import type EventEmitter from 'events'
import type { Config } from '../../config'
import type Prep from '../../prep'
import type { Pouch } from '../../pouch'
import type { Metadata } from '../../metadata'

export type ChannelEventsDispatcher = (ChannelBatch) => Promise<ChannelBatch>

type DispatchState = {
  [typeof STEP_NAME]: {
    localEndTimeout: ?TimeoutID
  }
}

type DispatchOptions = {
  config: Config,
  events: EventEmitter,
  prep: Prep,
  pouch: Pouch,
  state: DispatchState,
  onChannelEvents?: ChannelEventsDispatcher
}
*/

const SIDE = 'local'
const LOCAL_END_NOTIFICATION_DELAY = 1000 // 1 second
let actions

module.exports = {
  LOCAL_END_NOTIFICATION_DELAY,
  initialState,
  loop,
  step
}

async function initialState() /*: Promise<DispatchState> */ {
  return {
    [STEP_NAME]: {
      localEndTimeout: null
    }
  }
}

function loop(
  channel /*: Channel */,
  opts /*: DispatchOptions */
) /*: Channel */ {
  return channel.asyncMap(opts.onChannelEvents || step(opts))
}

function step(opts /*: DispatchOptions */) {
  return async (batch /*: ChannelBatch */) => {
    const { [STEP_NAME]: dispatchState } = opts.state

    clearTimeout(dispatchState.localEndTimeout)
    opts.events.emit('local-start')

    for (const event of batch) {
      try {
        await dispatchEvent(event, opts)
      } catch (err) {
        log.warn({ err, event }, 'could not dispatch local event')
      }
    }

    dispatchState.localEndTimeout = setTimeout(() => {
      opts.events.emit('local-end')
    }, LOCAL_END_NOTIFICATION_DELAY)

    return batch
  }
}

async function dispatchEvent(
  event /*: ChannelEvent */,
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
      try {
        const target = (
          await opts.pouch.db.changes({
            limit: 1,
            descending: true
          })
        ).last_seq
        opts.events.emit('sync-target', target)
      } catch (err) {
        log.warn({ err })
        /* ignore err */
      }
    } finally {
      release()
    }
  }
}

actions = {
  initialScanDone: ({ config, events }) => {
    log.info('Initial scan done')
    // TODO: remove with flag WINDOWS_DATE_MIGRATION_FLAG
    if (config.isFlagActive(WINDOWS_DATE_MIGRATION_FLAG)) {
      config.setFlag(WINDOWS_DATE_MIGRATION_FLAG, false)
    }
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
    const was /*: ?Metadata */ = await pouch.byLocalPath(event.oldPath)
    // If was is marked for deletion, we'll transform it into a move.
    if (!was) {
      if (await docWasAlreadyMoved(event.oldPath, event.path, pouch)) {
        log.debug({ event }, 'Assuming file already moved')
        return
      }

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
      const existing = await pouch.byLocalPath(event.path)
      doc.overwrite = existing
    }

    await prep.moveFileAsync(SIDE, doc, was)
  },

  renameddirectory: async (event, { pouch, prep }) => {
    const was /*: ?Metadata */ = await pouch.byLocalPath(event.oldPath)
    // If was is marked for deletion, we'll transform it into a move.
    if (!was) {
      if (await docWasAlreadyMoved(event.oldPath, event.path, pouch)) {
        log.debug({ event }, 'Assuming dir already moved')
        return
      }

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
      log.warn({ event }, 'Dir move source has been replaced in Pouch')
      return
    }
    log.info({ event }, 'Dir moved')

    const doc = buildDir(event.path, event.stats)
    if (event.overwrite) {
      const existing = await pouch.byLocalPath(event.path)
      doc.overwrite = existing
    }

    await prep.moveFolderAsync(SIDE, doc, was)
  },

  deletedfile: async (event, { pouch, prep }) => {
    const was /*: ?Metadata */ = await pouch.byLocalPath(event.path)
    if (!was || was.trashed) {
      log.debug({ event }, 'Assuming file already removed')
      // The file was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    log.info({ event }, 'File removed')
    await prep.trashFileAsync(SIDE, was)
  },

  deleteddirectory: async (event, { pouch, prep }) => {
    const was /*: ?Metadata */ = await pouch.byLocalPath(event.path)
    if (!was || was.trashed) {
      log.debug({ event }, 'Assuming dir already removed')
      // The dir was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    log.info({ event }, 'Dir removed')
    await prep.trashFolderAsync(SIDE, was)
  }
}

/* docWasAlreadyMoved checks if the move we're trying to merge was done by the
 * Sync and thus should be canceled.
 *
 * We check the previous revision of the possibly existing destination
 * record since we'll call this method only if the source record does not
 * exist anymore (i.e. so it cannot be retrieved) and after the lock was
 * released and the Sync has removed the moveFrom attribute from the record.
 */
async function docWasAlreadyMoved(
  src /*: string */,
  dst /*: string */,
  pouch /*: Pouch */
) /*: Promise<boolean> */ {
  try {
    const existing = await pouch.byLocalPath(dst)
    if (!existing) return false

    const previous = await pouch.getPreviousRev(existing._id, 1)
    return previous && previous.moveFrom && previous.moveFrom.path === src
  } catch (err) {
    // Doc not found so it was not moved
    return false
  }
}
