/**
 * @module core/local/chokidar/analyse_doc_events
 * @flow
 */

const _ = require('lodash')

const localChange = require('./local_change')
const { getInode } = require('./local_event')
const logger = require('../../utils/logger')
const measureTime = require('../../utils/perfs')

const component = 'chokidar/analyse_doc_events'

const log = logger({ component })

/*::
import type { LocalEvent } from './local_event'
import type {
  LocalChange,
  LocalDirAddition,
  LocalDirDeletion,
  LocalDirMove,
  LocalFileAddition,
  LocalFileDeletion,
  LocalFileMove
} from './local_change'
*/

const panic = (context, description) => {
  log.error(_.merge({ sentry: true }, context), description)
  throw new Error(description)
}

class LocalChangeMap {
  /*::
  changes: LocalChange[]
  changesByInode: Map<number, LocalChange>
  changesByPath: Map<string, LocalChange>
  */

  constructor() {
    this._clear()
  }

  _clear() {
    this.changes = []
    this.changesByInode = new Map()
    this.changesByPath = new Map()
  }

  findByInode(ino /*: ?number */) /*: ?LocalChange */ {
    if (ino) return this.changesByInode.get(ino)
    else return null
  }

  whenFoundByPath /*:: <T> */(
    path /*: string */,
    callback /*: (LocalChange) => T */
  ) /*: ?T */ {
    const change = this.changesByPath.get(path)
    if (change) return callback(change)
  }

  put(c /*: LocalChange */) {
    this.changesByPath.set(c.path, c)
    if (typeof c.ino === 'number') this.changesByInode.set(c.ino, c)
    else this.changes.push(c)
  }

  flush() /*: LocalChange[] */ {
    const changes = this.changes
    for (let a of this.changesByInode.values()) changes.push(a)
    this._clear()
    return changes
  }
}

const analyseEvent = (
  e /*: LocalEvent */,
  previousChanges /*: LocalChangeMap */
) /*: ?LocalChange|true */ => {
  const sameInodeChange = previousChanges.findByInode(getInode(e))

  switch (e.type) {
    case 'add':
      return (
        localChange.includeAddEventInFileMove(sameInodeChange, e) ||
        localChange.fileMoveFromUnlinkAdd(sameInodeChange, e) ||
        localChange.fileMoveIdenticalOffline(e) ||
        localChange.fileAddition(e)
      )
    case 'addDir':
      return (
        localChange.dirMoveOverwriteOnMacAPFS(sameInodeChange, e) ||
        localChange.dirRenamingIdenticalLoopback(sameInodeChange, e) ||
        localChange.includeAddDirEventInDirMove(sameInodeChange, e) ||
        localChange.dirMoveFromUnlinkAdd(sameInodeChange, e) ||
        localChange.dirRenamingCaseOnlyFromAddAdd(sameInodeChange, e) ||
        localChange.dirMoveIdenticalOffline(e) ||
        localChange.dirAddition(e)
      )
    case 'change':
      return (
        localChange.includeChangeEventIntoFileMove(sameInodeChange, e) ||
        localChange.fileMoveFromFileDeletionChange(sameInodeChange, e) ||
        localChange.fileMoveIdentical(sameInodeChange, e) ||
        localChange.fileUpdate(e)
      )
    case 'unlink':
      {
        const moveChange /*: ?LocalFileMove */ = localChange.maybeMoveFile(
          sameInodeChange
        )
        /* istanbul ignore next */
        if (moveChange) {
          // TODO: Pending move
          panic(
            { path: e.path, moveChange, event: e },
            'We should not have both move and unlink changes since ' +
              'checksumless adds and inode-less unlink events are dropped'
          )
        }
      }
      return (
        localChange.fileMoveFromAddUnlink(sameInodeChange, e) ||
        localChange.fileDeletion(e) ||
        previousChanges.whenFoundByPath(
          e.path,
          samePathChange =>
            localChange.convertFileMoveToDeletion(samePathChange) ||
            localChange.ignoreFileAdditionThenDeletion(samePathChange)
          // Otherwise, skip unlink event by multiple moves
        )
      )
    case 'unlinkDir':
      {
        const moveChange /*: ?LocalDirMove */ = localChange.maybeMoveFolder(
          sameInodeChange
        )
        /* istanbul ignore next */
        if (moveChange) {
          // TODO: pending move
          panic(
            { path: e.path, moveChange, event: e },
            'We should not have both move and unlinkDir changes since ' +
              'non-existing addDir and inode-less unlinkDir events are dropped'
          )
        }
      }
      return (
        localChange.dirMoveFromAddUnlink(sameInodeChange, e) ||
        localChange.dirDeletion(e) ||
        previousChanges.whenFoundByPath(
          e.path,
          samePathChange =>
            localChange.ignoreDirAdditionThenDeletion(samePathChange) ||
            localChange.convertDirMoveToDeletion(samePathChange)
        )
      )
    default:
      throw new TypeError(`Unknown event type: ${e.type}`)
  }
}

/** Analyse LocalEvent batch, aggregate events related to the same file or
 * directory into a single LocalChange and return a batch of those.
 *
 * - Aggregates corresponding `deleted` & `created` events as *moves*.
 * - Does not aggregate descendant moves.
 * - Does not sort changes.
 * - Handles weird event combos (e.g. identical renaming).
 */
const analyseDocEvents = (
  events /*: LocalEvent[] */,
  pendingChanges /*: LocalChange[] */
) /*: LocalChange[] */ => {
  const stopMeasure = measureTime(component)
  // OPTIMIZE: new Array(events.length)
  const changesFound = new LocalChangeMap()

  if (pendingChanges.length > 0) {
    log.warn(
      { changes: pendingChanges },
      `Prepend ${pendingChanges.length} pending change(s)`
    )
    for (const a of pendingChanges) {
      changesFound.put(a)
    }
    pendingChanges.length = 0
  }

  log.trace('Analyze events...')

  for (let e /*: LocalEvent */ of events) {
    if (process.env.DEBUG) log.trace({ currentEvent: e, path: e.path })
    try {
      // chokidar make mistakes
      if (e.type === 'unlinkDir' && e.old && e.old.docType === 'file') {
        log.warn(
          { event: e, old: e.old, path: e.path },
          'chokidar miscategorized event (was file, event unlinkDir)'
        )
        // $FlowFixMe
        e.type = 'unlink'
      }

      if (e.type === 'unlink' && e.old && e.old.docType === 'folder') {
        log.warn(
          { event: e, old: e.old, path: e.path },
          'chokidar miscategorized event (was folder, event unlink)'
        )
        // $FlowFixMe
        e.type = 'unlinkDir'
      }

      const result = analyseEvent(e, changesFound)
      if (result == null) continue // No change was found. Skip event.
      if (result === true) continue // A previous change was transformed. Nothing more to do.
      changesFound.put(result) // A new change was found
    } catch (err) {
      const sentry = err.name === 'InvalidLocalMoveEvent'
      log.error({ err, path: e.path, sentry })
      throw err
    }
  }

  log.trace('Flatten changes map...')
  const changes /*: LocalChange[] */ = changesFound.flush()

  stopMeasure()
  return changes
}

module.exports = {
  analyseDocEvents
}
