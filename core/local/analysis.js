/* @flow */

const path = require('path')

const { getInode } = require('./event')
const localChange = require('./change')
const ChangeMap = require('./ChangeMap')
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
log.chokidar = log.child({
  component: 'chokidar'
})

module.exports = function analysis (events /*: LocalEvent[] */, pendingChanges /*: LocalChange[] */) /*: LocalChange[] */ {
  const changes /*: LocalChange[] */ = analyseEvents(events, pendingChanges)
  sortBeforeSquash(changes)
  squashMoves(changes)
  finalSort(changes)
  return separatePendingChanges(changes, pendingChanges)
}

function analyseEvents (events /*: LocalEvent[] */, pendingChanges /*: LocalChange[] */) /*: LocalChange[] */ {
  const stopMeasure = measureTime('LocalWatcher#analyseEvents')
  const changes = ChangeMap.init(pendingChanges)
  const changeFound = (c /*: ?LocalChange */) => { c && ChangeMap.put(changes, c) }

  if (pendingChanges.length > 0) {
    log.warn({pendingChanges}, `Prepended ${pendingChanges.length} pending change(s)`)
    pendingChanges.length = 0
  }

  log.trace('Analyze events...')

  for (let e/*: LocalEvent */ of events) {
    try {
      // chokidar make mistakes
      if (e.type === 'unlinkDir' && e.old && e.old.docType === 'file') {
        log.warn({event: e, old: e.old, path: e.path}, 'chokidar miscategorized event (was file, event unlinkDir)')
        // $FlowFixMe
        e.type = 'unlink'
      }

      if (e.type === 'unlink' && e.old && e.old.docType === 'folder') {
        log.warn({event: e, old: e.old, path: e.path}, 'chokidar miscategorized event (was folder, event unlink)')
        // $FlowFixMe
        e.type = 'unlinkDir'
      }

      const sameInodeChange = ChangeMap.byInode(changes, getInode(e))
      const samePathChange = ChangeMap.byPath(changes, e.path)

      switch (e.type) {
        case 'add':
          changeFound(
            localChange.includeAddEventInFileMove(sameInodeChange, e) ||
            localChange.fileMoveFromUnlinkAdd(sameInodeChange, e) ||
            localChange.fileMoveIdenticalOffline(e) ||
            localChange.fromEvent(e)
          )
          break
        case 'addDir':
          changeFound(
            localChange.includeAddDirEventInDirMove(sameInodeChange, e) ||
            localChange.dirMoveFromUnlinkAdd(sameInodeChange, e) ||
            localChange.dirRenamingCaseOnlyFromAddAdd(sameInodeChange, e) ||
            localChange.dirMoveIdenticalOffline(e) ||
            localChange.fromEvent(e)
          )
          break
        case 'change':
          changeFound(
            localChange.includeChangeEventIntoFileMove(sameInodeChange, e) ||
            localChange.fileMoveFromFileDeletionChange(sameInodeChange, e) ||
            localChange.fileMoveIdentical(sameInodeChange, e) ||
            localChange.fromEvent(e)
          )
          break
        case 'unlink':
          localChange.ensureNotFileMove(sameInodeChange, e)
          changeFound(
            // TODO: pending move
            localChange.fileMoveFromAddUnlink(sameInodeChange, e) ||
            localChange.fromEventWithInode(e) ||
            localChange.convertFileMoveToDeletion(samePathChange)
            // Otherwise, skip unlink event from intermediate move
          )
          break
        case 'unlinkDir':
          localChange.ensureNotDirMove(sameInodeChange, e)
          changeFound(
            localChange.dirMoveFromAddUnlink(sameInodeChange, e) ||
            localChange.fromEventWithInode(e) ||
            localChange.dirAddedThenDeleted(samePathChange) ||
            localChange.convertDirMoveToDeletion(samePathChange)
            // Otherwise, skip unlinkDir event from intermediate move
          )
          break
        default:
          throw new TypeError(`Unknown event type: ${e.type}`)
      }
    } catch (err) {
      log.error({err, path: e.path})
      throw err
    }
    if (process.env.DEBUG) log.trace({currentEvent: e, path: e.path})
  }

  log.trace('Flatten changes map...')
  const result = ChangeMap.toArray(changes)

  stopMeasure()
  return result
}

// TODO: Rename according to the sort logic
function sortBeforeSquash (changes /*: LocalChange[] */) {
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

function squashMoves (changes /*: LocalChange[] */) {
  log.trace('Squash moves...')
  const stopMeasure = measureTime('LocalWatcher#squashMoves')

  for (let i = 0; i < changes.length; i++) {
    let a = changes[i]

    if (a.type !== 'DirMove' && a.type !== 'FileMove') break
    for (let j = i + 1; j < changes.length; j++) {
      let b = changes[j]
      if (b.type !== 'DirMove' && b.type !== 'FileMove') break

      // inline of LocalChange.isChildMove
      if (a.type === 'DirMove' &&
      b.path.indexOf(a.path + path.sep) === 0 &&
      a.old && b.old &&
      b.old.path.indexOf(a.old.path + path.sep) === 0) {
        log.debug({oldpath: b.old.path, path: b.path}, 'descendant move')
        a.wip = a.wip || b.wip
        if (b.path.substr(a.path.length) === b.old.path.substr(a.old.path.length)) {
          changes.splice(j--, 1)
        } else {
          // move inside move
          b.old.path = b.old.path.replace(a.old.path, a.path)
          b.needRefetch = true
        }
      }
    }
  }

  stopMeasure()
}

function separatePendingChanges (changes /*: LocalChange[] */, pendingChanges /*: LocalChange[] */) /*: LocalChange[] */ {
  log.trace('Reserve changes in progress for next flush...')

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (change.wip) {
      if (change.type === 'DirMove' || change.type === 'FileMove') {
        log.debug({
          change: change.type,
          oldpath: change.old.path,
          path: change.path,
          ino: change.ino
        }, 'incomplete change')
      } else {
        log.debug({change: change.type, path: change.path}, 'incomplete change')
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

  if (!localChange.addPath(b) && localChange.childOf(localChange.addPath(a), localChange.delPath(b))) return 1
  if (!localChange.addPath(a) && localChange.childOf(localChange.addPath(b), localChange.delPath(a))) return -1

  if (localChange.childOf(localChange.addPath(a), localChange.delPath(b))) return -1
  if (localChange.childOf(localChange.addPath(b), localChange.delPath(a))) return 1

  // if one change is a child of another, it takes priority
  if (localChange.isChildAdd(a, b)) return -1
  if (localChange.isChildDelete(b, a)) return -1
  if (localChange.isChildAdd(b, a)) return 1
  if (localChange.isChildDelete(a, b)) return 1

  if (localChange.delPath(a) === localChange.addPath(b)) return -1
  if (localChange.delPath(b) === localChange.addPath(a)) return 1

  // otherwise, order by add path
  if (localChange.lower(localChange.addPath(a), localChange.addPath(b))) return -1
  if (localChange.lower(localChange.addPath(b), localChange.addPath(a))) return 1

  // if there isnt 2 add paths, sort by del path
  if (localChange.lower(localChange.delPath(b), localChange.delPath(a))) return -1

  return 1
}

// TODO: Rename according to the sort logic
function finalSort (changes /*: LocalChange[] */) {
  log.trace('Final sort...')
  const stopMeasure = measureTime('LocalWatcher#finalSort')
  changes.sort(finalSorter)
  stopMeasure()
}
