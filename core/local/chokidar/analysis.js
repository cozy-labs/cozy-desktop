/** Turn messy low-level events into normalized high-level ones.
 *
 * ## Input
 *
 * The analysis receives
 * {@link module:core/local/chokidar/local_event|LocalEvent} batches.
 *
 * Moves are typically detected as `unlink*` + `add*` events. Directory moves
 * end up as a whole tree of those.
 *
 * Events are not necessarily in the correct order. Nor are they necessarily
 * batched together.
 *
 * ## Analysis substeps
 *
 * 1. {@link module:core/local/chokidar/analysis~analyseEvents|analyseEvents}
 * 2. {@link module:core/local/chokidar/analysis~sortBeforeSquash|sortBeforeSquash}
 * 3. {@link module:core/local/chokidar/analysis~squashMoves|squashMoves}
 * 4. {@link module:core/local/chokidar/analysis~finalSort|finalSort}
 * 5. {@link module:core/local/chokidar/analysis~separatePendingChanges|separatePendingChanges}
 *
 * ## Known issues
 *
 * - Substeps may end up eating a lot of CPU & RAM when batches are too big.
 * - See also individual substep issues.
 *
 * @module core/local/chokidar/analysis
 * @flow
 */

const path = require('path')
const _ = require('lodash')

const { getInode } = require('./local_event')
const localChange = require('./local_change')
const { logger } = require('../../utils/logger')
const { measureTime } = require('../../utils/perfs')
const metadata = require('../../metadata')

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
import type { InitialScanParams } from './initial_scan'
*/

const log = logger({
  component: 'LocalAnalysis'
})

module.exports = function analysis(
  events /*: LocalEvent[] */,
  {
    pendingChanges,
    initialScanParams
  } /*: { pendingChanges: LocalChange[], initialScanParams: InitialScanParams } */
) /*: LocalChange[] */ {
  const changes /*: LocalChange[] */ = analyseEvents(events, pendingChanges)
  fixUnsyncedMoves(changes)
  sortBeforeSquash(changes)
  squashMoves(changes)
  sortChanges(changes, !initialScanParams.done)
  return separatePendingChanges(changes, pendingChanges)
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
    const change = this.changesByPath.get(path.normalize())
    if (change) return callback(change)
  }

  put(c /*: LocalChange */, updated /*: ?boolean */) {
    const stopMeasure = measureTime(
      `LocalWatcher::LocalChangeMap#put(${updated ? 'updated' : 'new'})`
    )

    if (updated) {
      for (const [k, v] of this.changesByPath) {
        if (v == c) {
          this.changesByPath.delete(k)
          break
        }
      }
    }
    this.changesByPath.set(c.path.normalize(), c)
    if (typeof c.ino === 'number') this.changesByInode.set(c.ino, c)
    else this.changes.push(c)

    stopMeasure()
  }

  flush() /*: LocalChange[] */ {
    const stopMeasure = measureTime(`LocalWatcher::LocalChangeMap#flush`)
    const changes = this.changes
    for (let a of this.changesByInode.values()) changes.push(a)
    this._clear()
    stopMeasure()
    return changes
  }
}

/** Analyse low-level events and turn them into high level changes.
 *
 * - Aggregates corresponding `deleted` & `created` events as *moves*.
 * - Does not aggregate descendant moves.
 * - Does not sort changes.
 * - Handles known broken event combos (e.g. identical renaming).
 */
function analyseEvents(
  events /*: LocalEvent[] */,
  pendingChanges /*: LocalChange[] */
) /*: LocalChange[] */ {
  const stopMeasure = measureTime('LocalWatcher#analyseEvents')
  // OPTIMIZE: new Array(events.length)
  const changesFound = new LocalChangeMap()

  if (pendingChanges.length > 0) {
    log.warn(`Prepend ${pendingChanges.length} pending change(s)`, {
      changes: pendingChanges
    })
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
      if (e.type === 'unlinkDir' && e.old && e.old.docType === metadata.FILE) {
        log.warn('chokidar miscategorized event (was file, event unlinkDir)', {
          event: e,
          old: e.old,
          path: e.path
        })
        // $FlowFixMe
        e.type = 'unlink'
      }

      if (e.type === 'unlink' && e.old && e.old.docType === metadata.FOLDER) {
        log.warn('chokidar miscategorized event (was folder, event unlink)', {
          event: e,
          old: e.old,
          path: e.path
        })
        // $FlowFixMe
        e.type = 'unlinkDir'
      }

      const result = analyseEvent(e, changesFound)
      if (result == null) continue // No change was found. Skip event.

      // A new change was found or updated
      const [change, updated] = result
      changesFound.put(change, updated)
    } catch (err) {
      const sentry = err.name === 'InvalidLocalMoveEvent'
      log.error('Invalid local move event', { err, path: e.path, sentry })
      throw err
    }
  }

  log.trace('Flatten changes map...')
  const changes /*: LocalChange[] */ = changesFound.flush()

  stopMeasure()
  return changes
}

function analyseEvent(
  e /*: LocalEvent */,
  previousChanges /*: LocalChangeMap */
) /*: ?[LocalChange, boolean] */ {
  const sameInodeChange = previousChanges.findByInode(getInode(e))

  switch (e.type) {
    case 'add':
      return (
        localChange.includeAddEventInFileMove(sameInodeChange, e) ||
        localChange.fileMoveFromUnlinkAdd(sameInodeChange, e) ||
        localChange.fileRenamingCaseOnlyFromAddAdd(sameInodeChange, e) ||
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
    case 'unlink': {
      const moveChange /*: ?LocalFileMove */ =
        localChange.maybeMoveFile(sameInodeChange)
      if (moveChange && !moveChange.wip) delete e.old
      return (
        localChange.fileMoveFromAddUnlink(sameInodeChange, e) ||
        localChange.fileDeletion(e) ||
        previousChanges.whenFoundByPath(
          e.path,
          samePathChange =>
            localChange.convertFileMoveToDeletion(samePathChange) ||
            localChange.ignoreFileAdditionThenDeletion(samePathChange) ||
            localChange.ignoreUnmergedFileMoveThenDeletion(samePathChange)
        )
      )
    }
    case 'unlinkDir': {
      const moveChange /*: ?LocalDirMove */ =
        localChange.maybeMoveFolder(sameInodeChange)
      if (moveChange && !moveChange.wip) delete e.old
      return (
        localChange.dirMoveFromAddUnlink(sameInodeChange, e) ||
        localChange.dirDeletion(e) ||
        previousChanges.whenFoundByPath(
          e.path,
          samePathChange =>
            localChange.convertDirMoveToDeletion(samePathChange) ||
            localChange.ignoreDirAdditionThenDeletion(samePathChange) ||
            localChange.ignoreUnmergedDirMoveThenDeletion(samePathChange)
        )
      )
    }
    default:
      throw new TypeError(`Unknown event type: ${e.type}`)
  }
}

function fixUnsyncedMoves(changes /*: LocalChange[] */) {
  log.trace('Transform unsynced moves into additions...')
  const stopMeasure = measureTime('LocalWatcher#fixUnsyncedMoves')
  changes.forEach(change => {
    if (change.type === 'FileMove' && !change.old) {
      // $FlowFixMe deliberate type change
      change.type = 'FileAddition'
      delete change.old
      if (change.update) delete change.update
      log.debug('changed FileMove without old into FileAddition', {
        path: change.path,
        ino: change.ino,
        wip: change.wip
      })
    } else if (change.type === 'DirMove' && !change.old) {
      // $FlowFixMe deliberate type change
      change.type = 'DirAddition'
      delete change.old
      log.debug('changed DirMove without old into DirAddition', {
        path: change.path,
        ino: change.ino,
        wip: change.wip
      })
    }
  })
  stopMeasure()
}

/** First sort to make moves squashing easier.
 */
function sortBeforeSquash(changes /*: LocalChange[] */) {
  log.trace('Sort changes before squash...')
  const stopMeasure = measureTime('LocalWatcher#sortBeforeSquash')
  changes.sort((a, b) => {
    if (a.type === 'DirMove' || a.type === 'FileMove') {
      if (b.type === 'DirMove' || b.type === 'FileMove') {
        if (a.path.normalize() < b.path.normalize()) return -1
        else if (a.path.normalize() > b.path.normalize()) return 1
        else return 0
      } else return -1
    } else if (b.type === 'DirMove' || b.type === 'FileMove') {
      return 1
    } else {
      return 0
    }
  })
  stopMeasure()
}

/** Aggregate descendant moves with their corresponding root move change.
 */
function squashMoves(changes /*: LocalChange[] */) {
  log.trace('Squash moves...')
  const stopMeasure = measureTime('LocalWatcher#squashMoves')

  for (let i = 0; i < changes.length; i++) {
    const a = changes[i]
    if (a.type !== 'DirMove' && a.type !== 'FileMove') continue
    const pathA = a.path.normalize()
    const oldPathA = a.old.path.normalize()

    for (let j = i + 1; j < changes.length; j++) {
      const b = changes[j]
      if (b.type !== 'DirMove' && b.type !== 'FileMove') continue
      const pathB = b.path.normalize()
      const oldPathB = b.old.path.normalize()

      // inline of LocalChange.isChildMove
      if (
        a.type === 'DirMove' &&
        oldPathA &&
        oldPathB &&
        oldPathB.startsWith(oldPathA + path.sep)
      ) {
        log.debug('descendant move', { oldpath: b.old.path, path: b.path })
        if (pathB.substr(pathA.length) === oldPathB.substr(oldPathA.length)) {
          log.debug('ignoring explicit child move', {
            oldpath: b.old.path,
            path: b.path
          })
          changes.splice(j--, 1)
          if (b.type === 'FileMove' && b.update) {
            changes.push({
              sideName: 'local',
              type: 'FileUpdate',
              path: b.update.path,
              stats: b.update.stats,
              ino: b.ino,
              md5sum: b.update.md5sum,
              old: _.defaults({ path: b.update.path }, b.old),
              needRefetch: true
            })
          }
        } else {
          log.debug('move inside move', { oldpath: b.old.path, path: b.path })
          b.old.path = metadata.newChildPath(b.old.path, a.old.path, a.path)
          b.needRefetch = true
        }
      }
    }
  }

  stopMeasure()
}

/** Push back pending changes.
 *
 * More low-level events are expected to come up for those changes to be
 * complete. They will be injected back in the next analysis run.
 *
 * This step helped us fix a bunch of move scenarios with unexpected event
 * batches.
 *
 * ## Known issues
 *
 * - May break events order.
 * - No timeout (some changes may be pending forever).
 */
function separatePendingChanges(
  changes /*: LocalChange[] */,
  pendingChanges /*: LocalChange[] */
) /*: LocalChange[] */ {
  log.trace('Reserve changes in progress for next flush...')
  const stopMeasure = measureTime('LocalWatcher#separatePendingChanges')

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (change.wip) {
      if (change.type === 'DirMove' || change.type === 'FileMove') {
        log.debug('incomplete change', {
          change: change.type,
          oldpath: change.old.path,
          path: change.path,
          ino: change.ino
        })
      } else {
        log.debug('incomplete change', {
          change: change.type,
          path: change.path
        })
      }
      pendingChanges.push(changes[i])
    } else {
      log.debug(`Identified ${changes.length} change(s).`)
      log.debug(`${pendingChanges.length} of them are still pending.`)
      stopMeasure()
      return changes.slice(i)
    }
  }
  // All actions are WIP
  stopMeasure()
  return []
}

const aFirst = -1
const bFirst = 1

const initialScanSorter = (a /*: LocalChange */, b /*: LocalChange */) => {
  if (a.wip && !b.wip) return aFirst
  if (b.wip && !a.wip) return bFirst

  if (localChange.isChildAdd(a, b)) return aFirst
  if (localChange.isChildAdd(b, a)) return bFirst

  // XXX: isChildDelete will return true for child moves but we only want to
  // apply this rule to child deletions.
  if (!localChange.isChildMove(a, b) && localChange.isChildDelete(a, b))
    return bFirst
  if (!localChange.isChildMove(b, a) && localChange.isChildDelete(b, a))
    return aFirst

  if (
    (a.type === 'FileDeletion' || a.type === 'DirDeletion') &&
    b.type !== 'FileDeletion' &&
    b.type !== 'DirDeletion'
  )
    return bFirst
  if (
    (b.type === 'FileDeletion' || b.type === 'DirDeletion') &&
    a.type !== 'FileDeletion' &&
    a.type !== 'DirDeletion'
  )
    return aFirst

  if (localChange.lower(localChange.addPath(a), localChange.addPath(b)))
    return aFirst
  if (localChange.lower(localChange.addPath(b), localChange.addPath(a)))
    return bFirst
  if (localChange.lower(localChange.addPath(b), localChange.updatePath(a)))
    return bFirst
  if (localChange.lower(localChange.addPath(a), localChange.updatePath(b)))
    return aFirst

  // if there isnt 2 add paths, sort by del path
  if (localChange.lower(localChange.delPath(b), localChange.delPath(a)))
    return aFirst

  return bFirst
}

const defaultSorter = (a /*: LocalChange */, b /*: LocalChange */) => {
  if (a.wip && !b.wip) return aFirst
  if (b.wip && !a.wip) return bFirst

  // b is deleting something which is a children of what a adds
  if (
    !localChange.addPath(b) &&
    localChange.childOf(localChange.addPath(a), localChange.delPath(b))
  )
    return bFirst
  // a is deleting something which is a children of what b adds
  if (
    !localChange.addPath(a) &&
    localChange.childOf(localChange.addPath(b), localChange.delPath(a))
  )
    return aFirst

  // b is moving something which is a child of what a adds
  if (localChange.childOf(localChange.addPath(a), localChange.delPath(b)))
    return aFirst
  // a is deleting or moving something which is a child of what b adds
  if (localChange.childOf(localChange.addPath(b), localChange.delPath(a)))
    return bFirst

  // if one change is a parent of another, it takes priority
  if (localChange.isChildAdd(a, b)) return aFirst
  if (localChange.isChildUpdate(a, b)) return aFirst
  if (localChange.isChildDelete(b, a)) return aFirst
  if (localChange.isChildAdd(b, a)) return bFirst
  if (localChange.isChildUpdate(b, a)) return bFirst
  if (localChange.isChildDelete(a, b)) return bFirst

  // a is deleted what b added
  if (localChange.samePath(localChange.delPath(a), localChange.addPath(b)))
    return aFirst
  // b is deleting what a added
  if (localChange.samePath(localChange.delPath(b), localChange.addPath(a)))
    return bFirst

  // both adds at same path (seen with move + add)
  if (
    localChange.addPath(a) &&
    localChange.samePath(localChange.addPath(a), localChange.addPath(b))
  )
    return aFirst
  // both deletes at same path (seen with delete + move)
  if (
    localChange.delPath(a) &&
    localChange.samePath(localChange.delPath(a), localChange.delPath(b))
  )
    return bFirst

  // otherwise, order by add path
  if (localChange.lower(localChange.addPath(a), localChange.addPath(b)))
    return aFirst
  if (localChange.lower(localChange.addPath(b), localChange.addPath(a)))
    return bFirst
  if (localChange.lower(localChange.updatePath(a), localChange.addPath(b)))
    return aFirst
  if (localChange.lower(localChange.addPath(b), localChange.updatePath(a)))
    return bFirst
  if (localChange.lower(localChange.addPath(a), localChange.updatePath(b)))
    return aFirst
  if (localChange.lower(localChange.updatePath(b), localChange.addPath(a)))
    return bFirst
  if (localChange.lower(localChange.updatePath(a), localChange.updatePath(b)))
    return aFirst
  if (localChange.lower(localChange.updatePath(b), localChange.updatePath(a)))
    return bFirst

  // if there isnt 2 add paths, sort by del path
  if (localChange.lower(localChange.delPath(b), localChange.delPath(a)))
    return aFirst

  return bFirst
}

/** Final sort to ensure multiple changes at the same paths can be merged.
 *
 * Known issues:
 *
 * - Hard to change without breaking things.
 */
function sortChanges(
  changes /*: LocalChange[] */,
  isInitialScan /*: boolean */
) {
  log.trace('Final sort...')
  const stopMeasure = measureTime('LocalWatcher#finalSort')
  if (isInitialScan) changes.sort(initialScanSorter)
  else changes.sort(defaultSorter)
  stopMeasure()
}
