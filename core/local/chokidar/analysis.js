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
const logger = require('../../utils/logger')
const measureTime = require('../../utils/perfs')
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
  } /*: { pendingChanges: LocalChange[], initialScanParams: ?InitialScanParams } */
) /*: LocalChange[] */ {
  const changes /*: LocalChange[] */ = analyseEvents(events, pendingChanges)
  sortBeforeSquash(changes)
  squashMoves(changes)
  sortChanges(changes, initialScanParams != null)
  return separatePendingChanges(changes, pendingChanges)
}

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
    const change = this.changesByPath.get(path.normalize())
    if (change) return callback(change)
  }

  put(c /*: LocalChange */) {
    this.changesByPath.set(c.path.normalize(), c)
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
      log.error({ err, path: e.path, sentry }, 'Invalid local move event')
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
) /*: ?LocalChange|true */ {
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
        if (moveChange && !moveChange.wip) {
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
        if (moveChange && !moveChange.wip) {
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
        (oldPathA && oldPathB && oldPathB.startsWith(oldPathA + path.sep))
      ) {
        log.debug({ oldpath: b.old.path, path: b.path }, 'descendant move')
        if (pathB.substr(pathA.length) === oldPathB.substr(oldPathA.length)) {
          log.debug(
            { oldpath: b.old.path, path: b.path },
            'ignoring explicit child move'
          )
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
          log.debug({ oldpath: b.old.path, path: b.path }, 'move inside move')
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

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (change.wip) {
      if (change.type === 'DirMove' || change.type === 'FileMove') {
        log.debug(
          {
            change: change.type,
            oldpath: change.old.path,
            path: change.path,
            ino: change.ino
          },
          'incomplete change'
        )
      } else {
        log.debug(
          { change: change.type, path: change.path },
          'incomplete change'
        )
      }
      pendingChanges.push(changes[i])
    } else {
      log.debug(`Identified ${changes.length} change(s).`)
      log.debug(`${pendingChanges.length} of them are still pending.`)
      return changes.slice(i)
    }
  }
  // All actions are WIP
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
