/* @flow */

import path from 'path'

import { getInode } from './event'
import * as localChange from './change'
import logger from '../logger'

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

const log = logger({
  component: 'LocalWatcher'
})
log.chokidar = log.child({
  component: 'Chokidar'
})

export default function analysis (events: LocalEvent[], pendingChanges: LocalChange[]): LocalChange[] {
  const changes: LocalChange[] = analyseEvents(events, pendingChanges)
  sortBeforeSquash(changes)
  squashMoves(changes)
  separatePendingChanges(changes, pendingChanges)
  finalSort(changes)

  log.debug(`Identified ${changes.length} change(s).`)
  return changes
}

const panic = (context, description) => {
  log.error(context, description)
  throw new Error(description)
}

function analyseEvents (events: LocalEvent[], pendingChanges: LocalChange[]): LocalChange[] {
  // OPTIMIZE: new Array(events.length)
  const changes: LocalChange[] = []
  const changesByInode:Map<number, LocalChange> = new Map()
  const changesByPath:Map<string, LocalChange> = new Map()
  const getChangeByInode = (e) => {
    const ino = getInode(e)
    if (ino) return changesByInode.get(ino)
    else return null
  }
  const getChangeByPath = (e) => {
    return changesByPath.get(e.path)
  }
  const changeFound = (c: LocalChange) => {
    changesByPath.set(c.path, c)
    if (c.ino) changesByInode.set(c.ino, c)
    else changes.push(c)
  }

  if (pendingChanges.length > 0) {
    log.warn({changes: pendingChanges}, `Prepend ${pendingChanges.length} pending change(s)`)
    for (const a of pendingChanges) { changeFound(a) }
    pendingChanges.length = 0
  }

  log.trace('Analyze events...')

  for (let e: LocalEvent of events) {
    try {
      switch (e.type) {
        case 'add':
          {
            const moveChange: ?LocalFileMove = localChange.maybeMoveFile(getChangeByInode(e))
            if (moveChange) {
              localChange.includeAddEventInFileMove(moveChange, e)
              break
            }

            const unlinkChange: ?LocalFileDeletion = localChange.maybeDeleteFile(getChangeByInode(e))
            if (unlinkChange) {
              changeFound(localChange.fileMoveFromUnlinkAdd(unlinkChange, e))
            } else {
              changeFound(localChange.fromEvent(e))
            }
          }
          break
        case 'addDir':
          {
            const moveChange: ?LocalDirMove = localChange.maybeMoveFolder(getChangeByInode(e))
            if (moveChange) {
              localChange.includeAddDirEventInDirMove(moveChange, e)
            }

            const unlinkChange: ?LocalDirDeletion = localChange.maybeDeleteFolder(getChangeByInode(e))
            if (unlinkChange) {
              changeFound(localChange.dirMoveFromUnlinkAdd(unlinkChange, e))
            } else {
              changeFound(localChange.fromEvent(e))
            }
          }
          break
        case 'change':
          changeFound(localChange.fromEvent(e))
          break
        case 'unlink':
          {
            const moveChange: ?LocalFileMove = localChange.maybeMoveFile(getChangeByInode(e))
            /* istanbul ignore next */
            if (moveChange) {
              // TODO: Pending move
              panic({path: e.path, moveChange, event: e},
                'We should not have both move and unlink changes since ' +
                'checksumless adds and inode-less unlink events are dropped')
            }

            const addChange: ?LocalFileAddition = localChange.maybeAddFile(getChangeByInode(e))
            if (addChange) {
              // TODO: pending move
              changeFound(localChange.fileMoveFromAddUnlink(addChange, e))
              break
            } else if (getInode(e)) {
              changeFound(localChange.fromEvent(e))
              break
            }
            const change: ?LocalFileMove = localChange.maybeMoveFile(getChangeByPath(e))
            if (change && change.md5sum == null) { // FIXME: if change && change.wip?
              localChange.convertFileMoveToDeletion(change)
            }
            // Otherwise, skip unlink event by multiple moves
          }
          break
        case 'unlinkDir':
          {
            const moveChange: ?LocalDirMove = localChange.maybeMoveFolder(getChangeByInode(e))
            /* istanbul ignore next */
            if (moveChange) {
              // TODO: pending move
              panic({path: e.path, moveChange, event: e},
                'We should not have both move and unlinkDir changes since ' +
                'non-existing addDir and inode-less unlinkDir events are dropped')
            }

            const addChange: ?LocalDirAddition = localChange.maybePutFolder(getChangeByInode(e))
            if (addChange) {
              changeFound(localChange.dirMoveFromAddUnlink(addChange, e))
            } else if (getInode(e)) {
              changeFound(localChange.fromEvent(e))
            } // else skip
          }
          // TODO: move & delete dir
          break
        default:
          throw new TypeError(`Unknown event type: ${e.type}`)
      }
    } catch (err) {
      log.error({err, path: e.path})
      throw err
    }
    if (process.env.DEBUG) log.trace({currentEvent: e, changes})
  }

  log.trace('Flatten changes map...')
  for (let a of changesByInode.values()) changes.push(a)

  return changes
}

// TODO: Rename according to the sort logic
function sortBeforeSquash (changes: LocalChange[]) {
  log.trace('Sort changes before squash...')
  changes.sort((a, b) => {
    if (a.type === 'LocalDirMove' || a.type === 'LocalFileMove') {
      if (b.type === 'LocalDirMove' || b.type === 'LocalFileMove') {
        if (a.path < b.path) return -1
        else if (a.path > b.path) return 1
        else return 0
      } else return -1
    } else if (b.type === 'LocalDirMove' || b.type === 'LocalFileMove') {
      return 1
    } else {
      return 0
    }
  })
}

function squashMoves (changes: LocalChange[]) {
  log.trace('Squash moves...')

  for (let i = 0; i < changes.length; i++) {
    let a = changes[i]

    if (a.type !== 'LocalDirMove' && a.type !== 'LocalFileMove') break
    for (let j = i + 1; j < changes.length; j++) {
      let b = changes[j]
      if (b.type !== 'LocalDirMove' && b.type !== 'LocalFileMove') break

      // inline of LocalChange.isChildMove
      if (a.type === 'LocalDirMove' &&
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
}

function separatePendingChanges (changes: LocalChange[], pendingChanges: LocalChange[]) {
  log.trace('Reserve changes in progress for next flush...')

  // TODO: Use _.partition()?
  for (let i = changes.length - 1; i >= 0; i--) {
    const change = changes[i]
    if (change.wip) {
      if (change.type === 'LocalDirMove' || change.type === 'LocalFileMove') {
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
      changes.splice(i, 1)
    }
  }
}

// TODO: Rename according to the sort logic
const finalSorter = (a: LocalChange, b: LocalChange) => {
  if (localChange.childOf(localChange.addPath(a), localChange.delPath(b))) return -1
  if (localChange.childOf(localChange.addPath(b), localChange.delPath(a))) return 1

  // if one change is a child of another, it takes priority
  if (localChange.isChildAdd(a, b)) return -1
  if (localChange.isChildDelete(b, a)) return -1
  if (localChange.isChildAdd(b, a)) return 1
  if (localChange.isChildDelete(a, b)) return 1

  // otherwise, order by add path
  if (localChange.lower(localChange.addPath(a), localChange.addPath(b))) return -1
  if (localChange.lower(localChange.addPath(b), localChange.addPath(a))) return 1

  // if there isnt 2 add paths, sort by del path
  if (localChange.lower(localChange.delPath(b), localChange.delPath(a))) return -1

  return 1
}

// TODO: Rename according to the sort logic
function finalSort (changes: LocalChange[]) {
  log.trace('Final sort...')
  changes.sort(finalSorter)
}
