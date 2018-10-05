/* @flow */

const _ = require('lodash')
const path = require('path')

/*::
import type fs from 'fs'
import type { Metadata } from '../metadata'
import type {
  LocalDirAdded,
  LocalDirUnlinked,
  LocalEvent,
  LocalFileAdded,
  LocalFileUnlinked,
  LocalFileUpdated
} from './event'
*/

const logger = require('../logger')
const { getInode } = require('./event')

module.exports = {
  isChildMove,
  addPath,
  delPath,
  childOf,
  lower,
  identify,
  isChildDelete,
  isChildAdd,
  toString
}

const log = logger({
  component: 'LocalChange'
})

/*::
export type LocalDirAddition = {sideName: 'local', type: 'DirAddition', path: string, old: ?Metadata, ino: number, stats: fs.Stats, wip?: true}
export type LocalDirDeletion = {sideName: 'local', type: 'DirDeletion', path: string, old: ?Metadata, ino: ?number}
export type LocalDirMove = {sideName: 'local', type: 'DirMove', path: string, old: Metadata, ino: number, stats: fs.Stats, wip?: true, needRefetch?: boolean, overwrite?: boolean}
export type LocalFileAddition = {sideName: 'local', type: 'FileAddition', path: string, old: ?Metadata, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type LocalFileDeletion = {sideName: 'local', type: 'FileDeletion', path: string, old: ?Metadata, ino: ?number}
export type LocalFileMove = {sideName: 'local', type: 'FileMove', path: string, old: Metadata, ino: number, stats: fs.Stats, md5sum: string, wip?: true, needRefetch?: boolean, update?: LocalFileUpdated, overwrite?: Metadata}
export type LocalFileUpdate = {sideName: 'local', type: 'FileUpdate', path: string, old: ?Metadata, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type LocalIgnored = {sideName: 'local', type: 'Ignored', path: string}

export type LocalChange =
  | LocalDirAddition
  | LocalDirDeletion
  | LocalDirMove
  | LocalFileAddition
  | LocalFileDeletion
  | LocalFileMove
  | LocalFileUpdate
  | LocalIgnored
*/

const sideName = 'local'

// TODO: Introduce specific builders?
function build (type /*: string */, path /*: string */, opts /*: ?{stats?: fs.Stats, md5sum?: string, old?: ?Metadata} */) /*: LocalChange */ {
  const change /*: Object */ = _.assign({sideName, type, path}, opts)
  if (change.wip == null) delete change.wip
  if (change.overwrite == null) delete change.overwrite
  if (change.md5sum == null) delete change.md5sum
  return change
}

function isChildMove (a /*: LocalChange */, b /*: LocalChange */) /*: boolean %checks */ {
  return a.type === 'DirMove' &&
         (b.type === 'DirMove' || b.type === 'FileMove') &&
        b.path.indexOf(a.path + path.sep) === 0 &&
        a.old && b.old &&
        b.old.path.indexOf(a.old.path + path.sep) === 0
}

const isDelete = (a /*: LocalChange */) /*: boolean %checks */ => a.type === 'DirDeletion' || a.type === 'FileDeletion'
const isAdd = (a /*: LocalChange */) /*: boolean %checks */ => a.type === 'DirAddition' || a.type === 'FileAddition'
const isMove = (a /*: LocalChange */) /*: boolean %checks */ => a.type === 'DirMove' || a.type === 'FileMove'

function addPath (a /*: LocalChange */) /*: ?string */ { return isAdd(a) || isMove(a) ? a.path : null }
function delPath (a /*: LocalChange */) /*: ?string */ { return isDelete(a) ? a.path : isMove(a) ? a.old.path : null }
function childOf (p1 /*: ?string */, p2 /*: ?string */) /*: boolean */ { return p1 != null && p2 != null && p2 !== p1 && p2.startsWith(p1 + path.sep) }
function lower (p1 /*: ?string */, p2 /*: ?string */) /*: boolean */ { return p1 != null && p2 != null && p2 !== p1 && p1 < p2 }

function isChildDelete (a /*: LocalChange */, b /*: LocalChange */) { return childOf(delPath(a), delPath(b)) }
function isChildAdd (a /*: LocalChange */, b /*: LocalChange */) { return childOf(addPath(a), addPath(b)) }

// $FlowFixMe
function toString (a /*: LocalChange */) /*: string */ { return '(' + a.type + ': ' + (a.old && a.old.path) + '-->' + a.path + ')' }

function identify (e /*: LocalEvent */, sameInodeChange /*: ?LocalChange */, samePathChange /*: ?LocalChange */) {
  switch (e.type) {
    case 'add':
      return (
        fileMoveFromTo(sameInodeChange, e) ||
        fileMoveSuccessiveTo(sameInodeChange, e) ||
        fileMoveIdenticalOffline(e) ||
        fromEvent(e)
      )
    case 'addDir':
      return (
        dirMoveSuccessiveTo(sameInodeChange, e) ||
        dirMoveFromTo(sameInodeChange, e) ||
        dirMoveIdentical(sameInodeChange, e) ||
        dirMoveIdenticalOffline(e) ||
        fromEvent(e)
      )
    case 'change':
      return (
        fileMoveThenUpdate(sameInodeChange, e) ||
        fileMoveIncompleteThenUpdate(sameInodeChange, e) ||
        fileMoveIdentical(sameInodeChange, e) ||
        fromEvent(e)
      )
    case 'unlink':
      ensureNotFileMove(sameInodeChange, e)

      return (
        // TODO: pending move
        fileMoveToFrom(sameInodeChange, e) ||
        fromEventWithInode(e) ||
        fileMoveThenDeletion(samePathChange)
        // Otherwise, skip unlink event from intermediate move
      )
    case 'unlinkDir':
      ensureNotDirMove(sameInodeChange, e)

      return (
        dirMoveToFrom(sameInodeChange, e) ||
        fromEventWithInode(e) ||
        dirAdditionThenDeletion(samePathChange) ||
        dirMoveThenDeletion(samePathChange)
        // Otherwise, skip unlinkDir event from intermediate move
      )
    default:
      throw new TypeError(`Unknown event type: ${e.type}`)
  }
}

function fromEvent (e/*: LocalEvent */) /*: LocalChange */ {
  const change = _fromEvent(e)
  log.debug(_.pick(change, ['path', 'ino', 'wip']), `${e.type} -> ${change.type}`)
  if (change.old == null) delete change.old
  return change
}

function fromEventWithInode (e /*: LocalEvent */) /*: ?LocalChange */ {
  if (getInode(e)) return fromEvent(e)
}

function _fromEvent (e/*: LocalEvent */) /*: LocalChange */ {
  switch (e.type) {
    case 'unlinkDir':
      return {sideName, type: 'DirDeletion', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'unlink':
      return {sideName, type: 'FileDeletion', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'addDir':
      const change = {sideName, type: 'DirAddition', old: e.old, path: e.path, stats: e.stats, ino: e.stats.ino, wip: e.wip}
      if (change.wip == null) delete change.wip
      return change
    case 'change':
      return {sideName, type: 'FileUpdate', path: e.path, old: e.old, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    case 'add':
      return {sideName, type: 'FileAddition', path: e.path, old: e.old, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    default:
      throw new TypeError(`wrong type ${e.type}`) // @TODO FlowFixMe
  }
}

function fileMoveSuccessiveTo (existingChange /*: ?LocalChange */, e /*: LocalFileAdded */) /*: * */ {
  if (existingChange && existingChange.type === 'FileDeletion') {
    log.debug({oldpath: existingChange.path, path: e.path, ino: existingChange.ino}, 'FileDeletion + add = FileMove')

    return build('FileMove', e.path, {
      stats: e.stats,
      md5sum: e.md5sum,
      old: existingChange.old,
      ino: existingChange.ino,
      wip: e.wip
    })
  }
}

function dirMoveFromTo (existingChange /*: ?LocalChange */, e /*: LocalDirAdded */) /*: * */ {
  if (existingChange && existingChange.type === 'DirDeletion') {
    log.debug({oldpath: existingChange.path, path: e.path}, 'DirDeletion + addDir = DirMove')
    return build('DirMove', e.path, {
      stats: e.stats,
      old: existingChange.old,
      ino: existingChange.ino,
      overwrite: e.old,
      wip: e.wip
    })
  }
}

function fileMoveToFrom (addChange /*: ?LocalChange */, e /*: LocalFileUnlinked */) /*: * */ {
  if (addChange && addChange.type === 'FileAddition') {
    log.debug({oldpath: e.path, path: addChange.path, ino: addChange.ino}, 'add + unlink = FileMove')
    return build('FileMove', addChange.path, {
      stats: addChange.stats,
      md5sum: addChange.md5sum,
      old: e.old,
      ino: addChange.ino,
      wip: addChange.wip
    })
  }
}

// There was an unlink on the same file, this is most probably a move and replace
function fileMoveIncompleteThenUpdate (fileDeletion /* : ?LocalChange */, e /* : LocalFileUpdated */) /*: * */ {
  if (fileDeletion && fileDeletion.type === 'FileDeletion') {
    const src = fileDeletion.old
    const dst = e.old
    const newDst = e
    log.debug({oldpath: fileDeletion.path, path: e.path},
      'unlink(src) + change(dst -> newDst) = FileMove.overwrite(src, newDst)')

    const fileMove = build('FileMove', e.path, {
      stats: newDst.stats,
      md5sum: newDst.md5sum,
      overwrite: dst,
      old: src,
      ino: newDst.stats.ino,
      wip: e.wip
    })

    return fileMove
  }
}

function dirMoveToFrom (addChange /*: ?LocalChange */, e /*: LocalDirUnlinked */) /*: * */ {
  if (addChange && addChange.type === 'DirAddition') {
    log.debug({oldpath: e.path, path: addChange.path}, 'addDir + unlinkDir = DirMove')
    return build('DirMove', addChange.path, {
      stats: addChange.stats,
      old: e.old,
      ino: addChange.ino,
      wip: addChange.wip
    })
  }
}

function fileMoveIdentical (addChange /*: ?LocalChange */, e /*: LocalFileUpdated */) /*: * */ {
  if (addChange && addChange.type === 'FileAddition' && addChange.path !== e.path) {
    log.debug({oldpath: e.path, path: addChange.path}, 'add + change = FileMove (same id)')
    return build('FileMove', addChange.path, {
      stats: e.stats,
      md5sum: e.md5sum,
      old: e.old,
      ino: addChange.ino,
      wip: addChange.wip
    })
  }
}

function fileMoveIdenticalOffline (dstEvent /*: LocalFileAdded */) /*: ?LocalFileMove */ {
  const srcDoc = dstEvent.old
  if (!srcDoc || srcDoc.path === dstEvent.path || srcDoc.ino !== dstEvent.stats.ino) return
  log.debug({oldpath: srcDoc.path, path: dstEvent.path}, 'add = FileMove (same id, offline)')
  return ({
    sideName,
    type: 'FileMove',
    path: dstEvent.path,
    stats: dstEvent.stats,
    md5sum: dstEvent.md5sum,
    old: srcDoc,
    ino: dstEvent.stats.ino
  } /*: LocalFileMove */)
}

function dirMoveIdentical (existingChange /*: ?LocalChange */, e /*: LocalDirAdded */) /*: * */ {
  if (existingChange && existingChange.type === 'DirAddition') {
    log.debug({oldpath: existingChange.path, path: e.path}, 'DirAddition + addDir = DirMove (same id)')

    return build('DirMove', e.path, {
      stats: existingChange.stats,
      old: existingChange.old,
      ino: existingChange.ino,
      wip: e.wip
    })
  }
}

function dirMoveIdenticalOffline (dstEvent /*: LocalDirAdded */) /*: ?LocalDirMove */ {
  const srcDoc = dstEvent.old
  if (!srcDoc || srcDoc.path === dstEvent.path || srcDoc.ino !== dstEvent.stats.ino) return
  log.debug({oldpath: srcDoc.path, path: dstEvent.path}, 'addDir = DirMove (same id, offline)')
  return {
    sideName,
    type: 'DirMove',
    path: dstEvent.path,
    stats: dstEvent.stats,
    old: srcDoc,
    ino: dstEvent.stats.ino
  }
}

/*::
export type LocalMove = LocalFileMove|LocalDirMove
export type LocalMoveEvent = LocalFileAdded|LocalDirAdded
*/

function InvalidLocalMoveEvent (moveChange /*: LocalMove */, event /*: LocalMoveEvent */) {
  this.name = 'InvalidLocalMoveEvent'
  this.moveChange = moveChange
  this.event = event
  // FIXME: Include event/change details in message
  this.message = `Cannot include event ${event.type} into change ${moveChange.type}`
  Error.captureStackTrace(this, this.constructor)
}

const ensureValidMoveEvent = (moveChange /*: LocalMove */, event /*: LocalMoveEvent */) => {
  /* istanbul ignore next */
  if (!moveChange.wip) throw new InvalidLocalMoveEvent(moveChange, event)
}

function fileMoveFromTo (existingChange /*: ?LocalChange */, e /*: LocalFileAdded */) /*: ?LocalFileMove */ {
  if (existingChange &&
      existingChange.type === 'FileMove') {
    if (!existingChange.wip &&
         existingChange.path === e.path &&
         existingChange.stats.ino === e.stats.ino &&
         existingChange.md5sum === e.md5sum) return
    ensureValidMoveEvent(existingChange, e)
    const moveChange = _.clone(existingChange)
    moveChange.path = e.path
    moveChange.stats = e.stats
    moveChange.md5sum = e.md5sum
    delete moveChange.wip
    log.debug(
      {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
      'FileMove + add = FileMove')
    return moveChange
  }
}

function dirMoveSuccessiveTo (existingMove /*: ?LocalChange */, e /*: LocalDirAdded */) /*: ?LocalDirMove */ {
  if (existingMove && existingMove.type === 'DirMove') {
    const moveChange = _.clone(existingMove)
    if (!moveChange.wip &&
         moveChange.path === e.path &&
         moveChange.stats.ino === e.stats.ino
       ) {
      // FIXME This is based on a bug in chokidar where
      // an overwriting move have two addDir events on mac+APFS
      // but no unlinkDir for the overwritten destination.
      moveChange.overwrite = true
      return moveChange
    }
    ensureValidMoveEvent(moveChange, e)
    moveChange.path = e.path
    moveChange.stats = e.stats
    delete moveChange.wip
    log.debug(
     {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
     'DirMove + addDir = DirMove')
    return moveChange
  }
}

function fileMoveThenUpdate (sameInodeChange /*: ?LocalChange */, e /*: LocalFileUpdated */) /*: ?LocalFileMove */ {
  if (sameInodeChange && sameInodeChange.type === 'FileMove') {
    const moveChange = _.clone(sameInodeChange)
    log.debug({path: e.path}, 'FileMove + change')
    moveChange.md5sum = moveChange.old.md5sum || moveChange.md5sum
    moveChange.update = _.defaults({
      // In almost all cases, change event has the destination path.
      // But on macOS identical renaming, it has the source path.
      // So we make sure the file change being merged after the move
      // won't erase the destination path with the source one.
      // Should be a no-op on all other cases anyway, since e.path
      // should already be the same as moveChange.path
      path: moveChange.path
    }, e)
    return moveChange
  }
}

function fileMoveThenDeletion (samePathChange /*: ?LocalChange */) /*: ?LocalFileMove */ {
  if (samePathChange && samePathChange.type === 'FileMove' && samePathChange.md5sum == null) { // FIXME: if change && change.wip?
    const change = _.clone(samePathChange)
    log.debug({path: change.old.path, ino: change.ino},
      'FileMove + unlink = FileDeletion')
    // $FlowFixMe
    change.type = 'FileDeletion'
    change.path = change.old.path
    delete change.stats
    delete change.wip
    return change
  }
}

function dirMoveThenDeletion (samePathChange /*: ?LocalChange */) /*: ?LocalDirMove */ {
  if (samePathChange && samePathChange.type === 'DirMove' && samePathChange.wip) {
    const change = _.clone(samePathChange)
    log.debug({path: change.old.path, ino: change.ino},
      'DirMove + unlinkDir = DirDeletion')
    // $FlowFixMe
    change.type = 'DirDeletion'
    change.path = change.old.path
    delete change.stats
    delete change.wip
    return change
  }
}

function dirAdditionThenDeletion (samePathChange /*: ?LocalChange */) /*: ?LocalIgnored */ {
  if (samePathChange && samePathChange.type === 'DirAddition' && samePathChange.wip) {
    const change = _.clone(samePathChange)
    log.debug({path: change.path, ino: change.ino},
      'Folder was added then deleted. Ignoring add.')
    // $FlowFixMe
    change.type = 'Ignored'
    return change
  }
}

function ensureNotDirMove (sameInodeChange /*: ?LocalChange */, e /*: LocalDirUnlinked */) {
  /* istanbul ignore next */
  if (sameInodeChange && sameInodeChange.type === 'DirMove') {
    // TODO: pending move
    panic({path: e.path, sameInodeChange, event: e},
      'We should not have both move and unlinkDir changes since ' +
      'non-existing addDir and inode-less unlinkDir events are dropped')
  }
}

function ensureNotFileMove (sameInodeChange /*: ?LocalChange */, e /*: LocalFileUnlinked */) {
  /* istanbul ignore next */
  if (sameInodeChange && sameInodeChange.type === 'FileMove') {
    // TODO: Pending move
    panic({path: e.path, sameInodeChange, event: e},
      'We should not have both move and unlink changes since ' +
      'checksumless adds and inode-less unlink events are dropped')
  }
}

function panic (context, description) {
  log.error(_.merge({sentry: true}, context), description)
  throw new Error(description)
}
