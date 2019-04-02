/* @flow */

const _ = require('lodash')

const winDetectMove = require('./win_detect_move')
const { buildDir, buildFile, id } = require('../../metadata')
const logger = require('../../logger')

const STEP_NAME = 'dispatch'

const log = logger({
  component: `atom/${STEP_NAME}`
})

/*::
import type Buffer from './buffer'
import type { Batch } from './event'
import type { WinDetectMoveState } from './win_detect_move'
import type EventEmitter from 'events'
import type Prep from '../../prep'
import type Pouch from '../../pouch'

export type AtomEventsDispatcher = (Batch) => Promise<Batch>

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

// Dispatch takes a buffer of AtomWatcherEvents batches, and calls Prep for
// each event. It needs to fetch the old documents from pouchdb in some cases
// to have all the data expected by prep/merge.
function loop (buffer /*: Buffer */, opts /*: DispatchOptions */) /*: Buffer */ {
  return buffer.asyncMap(
    opts.onAtomEvents || step(opts)
  )
}

function step (opts /*: DispatchOptions */) {
  return async (batch /*: Batch */) => {
    for (const event of batch) {
      try {
        log.trace({event}, 'dispatch')
        if (event.action === 'initial-scan-done') {
          actions.initialScanDone(opts)
        } else if (event.action === 'ignored') {
          actions.ignored(event)
        } else {
          await actions[event.action + event.kind](event, opts)
        }
      } catch (err) {
        log.error({err, event})
      } finally {
        if (process.platform === 'win32') {
          winDetectMove.forget(event, opts.state)
        }
      }
    }
    return batch
  }
}

actions = {
  initialScanDone: ({events}) => {
    log.info('Initial scan done')
    events.emit('initial-scan-done')
  },

  ignored: event => {
    log.debug({event}, 'Ignored')
  },

  scanfile: (event, opts) => actions.createdfile(event, opts, 'File found'),

  scandirectory: (event, opts) => actions.createddirectory(event, opts, 'Dir found'),

  createdfile: async (event, {prep}, description = 'File added') => {
    log.info({event}, description)
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await prep.addFileAsync(SIDE, doc)
  },

  createddirectory: async (event, {prep}, description = 'Dir added') => {
    log.info({event}, description)
    const doc = buildDir(event.path, event.stats)
    await prep.putFolderAsync(SIDE, doc)
  },

  modifiedfile: async (event, {prep}) => {
    log.info({event}, 'File modified')
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await prep.updateFileAsync(SIDE, doc)
  },

  modifieddirectory: async (event, {prep}) => {
    log.info({event}, 'Dir modified')
    const doc = buildDir(event.path, event.stats)
    await prep.putFolderAsync(SIDE, doc)
  },

  renamedfile: async (event, {pouch, prep}) => {
    const old = await pouch.byIdMaybeAsync(id(event.oldPath))
    if (!old) {
      // A renamed event where the source does not exist can be seen as just an
      // add. It can happen on Linux when a file is added when the client is
      // stopped, and is moved before it was scanned.
      _.set(event, [STEP_NAME, 'originalEvent'], _.clone(event))
      event.action = 'created'
      delete event.oldPath
      return actions.createdfile(event, {prep}, 'File moved, assuming added')
    }
    log.info({event}, 'File moved')
    const doc = buildFile(event.path, event.stats, event.md5sum)
    await prep.moveFileAsync(SIDE, doc, old)
  },

  renameddirectory: async (event, {pouch, prep}) => {
    const old = await pouch.byIdMaybeAsync(id(event.oldPath))
    if (!old) {
      // A renamed event where the source does not exist can be seen as just an
      // add. It can happen on Linux when a dir is added when the client is
      // stopped, and is moved before it was scanned.
      _.set(event, [STEP_NAME, 'originalEvent'], _.clone(event))
      event.action = 'created'
      delete event.oldPath
      return actions.createddirectory(event, {prep}, 'Dir moved, assuming added')
    }
    log.info({event}, 'Dir moved')
    const doc = buildDir(event.path, event.stats)
    await prep.moveFolderAsync(SIDE, doc, old)
  },

  deletedfile: async (event, {pouch, prep}) => {
    const old = await pouch.byIdMaybeAsync(event._id)
    if (!old) {
      log.debug({event}, 'Assuming file already removed')
      // The file was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    log.info({event}, 'File removed')
    await prep.trashFileAsync(SIDE, old)
  },

  deleteddirectory: async (event, {pouch, prep}) => {
    const old = await pouch.byIdMaybeAsync(event._id)
    if (!old) {
      log.debug({event}, 'Assuming dir already removed')
      // The dir was already marked as deleted in pouchdb
      // => we can ignore safely this event
      return
    }
    log.info({event}, 'Dir removed')
    await prep.trashFolderAsync(SIDE, old)
  }
}
