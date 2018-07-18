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

module.exports = {
  build,
  maybeAddFile,
  maybePutFolder,
  maybeMoveFile,
  maybeMoveFolder,
  maybeDeleteFile,
  maybeDeleteFolder,
  find,
  isChildMove,
  addPath,
  delPath,
  childOf,
  lower,
  isChildDelete,
  isChildAdd,
  toString,
  fromEvent,
  fileMoveFromUnlinkAdd,
  fileUnlinkAndMoveFromUnlinkChange,
  dirMoveFromUnlinkAdd,
  fileMoveFromAddUnlink,
  dirMoveFromAddUnlink,
  includeAddEventInFileMove,
  includeAddDirEventInDirMove,
  includeChangeEventIntoFileMove,
  convertFileMoveToDeletion,
  convertDirMoveToDeletion
}

const log = logger({
  component: 'local/change'
})

/*::
export type LocalDirAddition = {sideName: 'local', type: 'DirAddition', path: string, ino: number, stats: fs.Stats, wip?: true}
export type LocalDirDeletion = {sideName: 'local', type: 'DirDeletion', path: string, old: ?Metadata, ino: ?number}
export type LocalDirMove = {sideName: 'local', type: 'DirMove', path: string, old: Metadata, ino: number, stats: fs.Stats, wip?: true, needRefetch: boolean}
export type LocalFileAddition = {sideName: 'local', type: 'FileAddition', path: string, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type LocalFileDeletion = {sideName: 'local', type: 'FileDeletion', path: string, old: ?Metadata, ino: ?number}
export type LocalFileMove = {sideName: 'local', type: 'FileMove', path: string, old: Metadata, ino: number, stats: fs.Stats, md5sum: string, wip?: true, needRefetch: boolean, update?: LocalFileUpdated}
export type LocalFileUpdate = {sideName: 'local', type: 'FileUpdate', path: string, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
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
  if (change.md5sum == null) delete change.md5sum
  return change
}

function maybeAddFile (a /*: ?LocalChange */) /*: ?LocalFileAddition */ { return (a && a.type === 'FileAddition') ? a : null }
function maybePutFolder (a /*: ?LocalChange */) /*: ?LocalDirAddition */ { return (a && a.type === 'DirAddition') ? a : null }
function maybeMoveFile (a /*: ?LocalChange */) /*: ?LocalFileMove */ { return (a && a.type === 'FileMove') ? a : null }
function maybeMoveFolder (a /*: ?LocalChange */) /*: ?LocalDirMove */ { return (a && a.type === 'DirMove') ? a : null }
function maybeDeleteFile (a /*: ?LocalChange */) /*: ?LocalFileDeletion */ { return (a && a.type === 'FileDeletion') ? a : null }
function maybeDeleteFolder (a /*: ?LocalChange */) /*: ?LocalDirDeletion */ { return (a && a.type === 'DirDeletion') ? a : null }

function find /*:: <T> */ (changes /*: LocalChange[] */, maybeRightType /*: (LocalChange) => ?T */, predicate /*: (T) => boolean */, remove /*: ?true */) /*: ?T */ {
  for (let i = 0; i < changes.length; i++) {
    const anyChange = changes[i]
    const rightTypeChange /*: ?T */ = maybeRightType(anyChange)
    if (rightTypeChange != null && predicate(rightTypeChange)) {
      if (remove) changes.splice(i, 1)
      return rightTypeChange
    }
  }
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

function fromEvent (e/*: LocalEvent */) /*: LocalChange */ {
  const change = _fromEvent(e)
  log.debug(_.pick(change, ['path', 'ino', 'wip']), `${e.type} -> ${change.type}`)
  return change
}

function _fromEvent (e/*: LocalEvent */) /*: LocalChange */ {
  switch (e.type) {
    case 'unlinkDir':
      return {sideName, type: 'DirDeletion', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'unlink':
      return {sideName, type: 'FileDeletion', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'addDir':
      const change = {sideName, type: 'DirAddition', path: e.path, stats: e.stats, ino: e.stats.ino, wip: e.wip}
      if (change.wip == null) delete change.wip
      return change
    case 'change':
      return {sideName, type: 'FileUpdate', path: e.path, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, old: e.old, wip: e.wip}
    case 'add':
      return {sideName, type: 'FileAddition', path: e.path, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    default:
      throw new TypeError(`wrong type ${e.type}`) // @TODO FlowFixMe
  }
}

function fileMoveFromUnlinkAdd (unlinkChange /*: LocalFileDeletion */, e /*: LocalFileAdded */) /*: * */ {
  log.debug({oldpath: unlinkChange.path, path: e.path, ino: unlinkChange.ino}, 'unlink + add = FileMove')
  return build('FileMove', e.path, {
    stats: e.stats,
    md5sum: e.md5sum,
    old: unlinkChange.old,
    ino: unlinkChange.ino,
    wip: e.wip
  })
}

function dirMoveFromUnlinkAdd (unlinkChange /*: LocalDirDeletion */, e /*: LocalDirAdded */) /*: * */ {
  log.debug({oldpath: unlinkChange.path, path: e.path}, 'unlinkDir + addDir = DirMove')
  return build('DirMove', e.path, {
    stats: e.stats,
    old: unlinkChange.old,
    ino: unlinkChange.ino,
    wip: e.wip
  })
}

function fileMoveFromAddUnlink (addChange /*: LocalFileAddition */, e /*: LocalFileUnlinked */) /*: * */ {
  log.debug({oldpath: e.path, path: addChange.path, ino: addChange.ino}, 'add + unlink = FileMove')
  return build('FileMove', addChange.path, {
    stats: addChange.stats,
    md5sum: addChange.md5sum,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })
}

function fileUnlinkAndMoveFromUnlinkChange (unlinkChange /* :LocalFileDeletion */, e /* : LocalFileUpdated */) {
  const src = unlinkChange.old
  const dst = e.old
  const newDst = e
  log.debug({oldpath: unlinkChange.path, path: e.path},
    'unlink(src) + change(dst -> newDst) = FileDeletion(dst) + FileMove(src, newDst)')

  const fileDeletion = build('FileDeletion', e.path, {
    old: dst
  })
  const fileMove = build('FileMove', e.path, {
    stats: newDst.stats,
    md5sum: newDst.md5sum,
    overwrite: true,
    old: src,
    ino: newDst.stats.ino,
    wip: e.wip
  })

  return [fileDeletion, fileMove]
}

function dirMoveFromAddUnlink (addChange /*: LocalDirAddition */, e /*: LocalDirUnlinked */) /*: * */ {
  log.debug({oldpath: e.path, path: addChange.path}, 'addDir + unlinkDir = DirMove')
  return build('DirMove', addChange.path, {
    stats: addChange.stats,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })
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

function includeAddEventInFileMove (moveChange /*: LocalFileMove */, e /*: LocalFileAdded */) {
  ensureValidMoveEvent(moveChange, e)
  moveChange.path = e.path
  moveChange.stats = e.stats
  moveChange.md5sum = e.md5sum
  delete moveChange.wip
  log.debug(
    {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
    'FileMove + add = FileMove')
}

function includeAddDirEventInDirMove (moveChange /*: LocalDirMove */, e /*: LocalDirAdded */) {
  ensureValidMoveEvent(moveChange, e)
  moveChange.path = e.path
  moveChange.stats = e.stats
  delete moveChange.wip
  log.debug(
   {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
   'DirMove + addDir = DirMove')
}

function includeChangeEventIntoFileMove (moveChange /*: LocalFileMove */, e /*: LocalFileUpdated */) {
  log.debug({path: e.path}, 'FileMove + change')
  moveChange.md5sum = moveChange.old.md5sum || moveChange.md5sum
  moveChange.update = e
}

function convertFileMoveToDeletion (change /*: LocalFileMove */) {
  log.debug({path: change.old.path, ino: change.ino},
    'FileMove + unlink = FileDeletion')
  // $FlowFixMe
  change.type = 'FileDeletion'
  change.path = change.old.path
  delete change.stats
  delete change.wip
}

function convertDirMoveToDeletion (change /*: LocalDirMove */) {
  log.debug({path: change.old.path, ino: change.ino},
    'DirMove + unlinkDir = DirDeletion')
  // $FlowFixMe
  change.type = 'DirDeletion'
  change.path = change.old.path
  delete change.stats
  delete change.wip
}
