/* @flow */

const path = require('path')
const _ = require('lodash')

const { getInode } = require('./event')
const localChange = require('./change')
const logger = require('../logger')
const measureTime = require('../perftools')

/*::
import type { LocalEvent } from './event'
import type {
  LocalChange,
  LocalDirAddition,
  LocalDirDeletion,
  LocalDirMove,
  LocalFileAddition,
  LocalFileDeletion,
  LocalFileMove
} from './change'
*/

const log = logger({
  component: 'LocalAnalysis'
})

module.exports = function analysis(
  events /*: LocalEvent[] */,
  pendingChanges /*: LocalChange[] */
) /*: LocalChange[] */ {
  const changes /*: LocalChange[] */ = analyseEvents(events, pendingChanges)
  sortBeforeSquash(changes)
  squashMoves(changes)
  finalSort(changes)
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
      log.error({ err, path: e.path, sentry })
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

// TODO: Rename according to the sort logic
function sortBeforeSquash(changes /*: LocalChange[] */) {
  log.trace('Sort changes before squash...')
  const stopMeasure = measureTime('LocalWatcher#sortBeforeSquash')
  changes.sort((a, b) => {
    if (a.type === 'DirMove' || a.type === 'FileMove') {
      if (b.type === 'DirMove' || b.type === 'FileMove') {
        if (a.path < b.path) return -1
        else if (a.path > b.path) return 1
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

function squashMoves(changes /*: LocalChange[] */) {
  log.trace('Squash moves...')
  const stopMeasure = measureTime('LocalWatcher#squashMoves')

  for (let i = 0; i < changes.length; i++) {
    let a = changes[i]

    if (a.type !== 'DirMove' && a.type !== 'FileMove') break
    for (let j = i + 1; j < changes.length; j++) {
      let b = changes[j]
      if (b.type !== 'DirMove' && b.type !== 'FileMove') break

      // inline of LocalChange.isChildMove
      if (
        a.type === 'DirMove' &&
        b.path.indexOf(a.path + path.sep) === 0 &&
        a.old &&
        b.old &&
        b.old.path.indexOf(a.old.path + path.sep) === 0
      ) {
        log.debug({ oldpath: b.old.path, path: b.path }, 'descendant move')
        a.wip = a.wip || b.wip
        if (
          b.path.substr(a.path.length) === b.old.path.substr(a.old.path.length)
        ) {
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
          b.old.path = b.old.path.replace(a.old.path, a.path)
          b.needRefetch = true
        }
      }
    }
  }

  stopMeasure()
}

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

// TODO: Rename according to the sort logic
const finalSorter = (a /*: LocalChange */, b /*: LocalChange */) => {
  if (a.wip && !b.wip) return -1
  if (b.wip && !a.wip) return 1

  // b is deleting something which is a children of what a adds
  if (
    !localChange.addPath(b) &&
    localChange.childOf(localChange.addPath(a), localChange.delPath(b))
  )
    return 1
  // a is deleting something which is a children of what b adds
  if (
    !localChange.addPath(a) &&
    localChange.childOf(localChange.addPath(b), localChange.delPath(a))
  )
    return -1

  // b is moving something which is a children of what a adds
  if (localChange.childOf(localChange.addPath(a), localChange.delPath(b)))
    return -1
  // a is deleting or moving something which is a children of what b adds
  if (localChange.childOf(localChange.addPath(b), localChange.delPath(a)))
    return 1

  // if one change is a child of another, it takes priority
  if (localChange.isChildAdd(a, b)) return -1
  if (localChange.isChildUpdate(a, b)) return -1
  if (localChange.isChildDelete(b, a)) return -1
  if (localChange.isChildAdd(b, a)) return 1
  if (localChange.isChildUpdate(b, a)) return 1
  if (localChange.isChildDelete(a, b)) return 1

  // a is deleted what b added
  if (localChange.delPath(a) === localChange.addPath(b)) return -1
  // b is deleting what a added
  if (localChange.delPath(b) === localChange.addPath(a)) return 1

  // both adds at same path (seen with move + add)
  if (
    localChange.addPath(a) &&
    localChange.addPath(a) === localChange.addPath(b)
  )
    return -1
  // both deletes at same path (seen with delete + move)
  if (
    localChange.delPath(a) &&
    localChange.delPath(a) === localChange.delPath(b)
  )
    return 1

  // otherwise, order by add path
  if (localChange.lower(localChange.addPath(a), localChange.addPath(b)))
    return -1
  if (localChange.lower(localChange.addPath(b), localChange.addPath(a)))
    return 1

  // if there isnt 2 add paths, sort by del path
  if (localChange.lower(localChange.delPath(b), localChange.delPath(a)))
    return -1

  return 1
}

// TODO: Rename according to the sort logic
function finalSort(changes /*: LocalChange[] */) {
  log.trace('Final sort...')
  const stopMeasure = measureTime('LocalWatcher#finalSort')
  changes.sort(finalSorter)
  stopMeasure()
}
