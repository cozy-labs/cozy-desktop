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
  dirAddition,
  dirDeletion,
  fileAddition,
  fileDeletion,
  fileUpdate,
  fileMoveFromUnlinkAdd,
  fileMoveFromFileDeletionChange,
  fileMoveIdentical,
  fileMoveIdenticalOffline,
  dirMoveFromUnlinkAdd,
  fileMoveFromAddUnlink,
  dirMoveFromAddUnlink,
  dirRenamingCaseOnlyFromAddAdd,
  dirMoveIdenticalOffline,
  includeAddEventInFileMove,
  includeAddDirEventInDirMove,
  includeChangeEventIntoFileMove,
  convertFileMoveToDeletion,
  convertDirMoveToDeletion
}

const log = logger({
  component: 'LocalChange'
})

/*::
export type LocalDirAddition = {
  sideName: 'local',
  type: 'DirAddition',
  path: string,
  old?: Metadata,
  ino: number,
  stats: fs.Stats,
  wip?: true
}
export type LocalDirDeletion = {
  sideName: 'local',
  type: 'DirDeletion',
  path: string,
  old?: Metadata,
  ino?: number
}
export type LocalDirMove = {
  sideName: 'local',
  type: 'DirMove',
  path: string,
  old: Metadata,
  ino: number,
  stats: fs.Stats,
  wip?: true,
  needRefetch?: boolean,
  overwrite?: boolean
}
export type LocalFileAddition = {
  sideName: 'local',
  type: 'FileAddition',
  path: string,
  old?: Metadata,
  ino: number,
  stats: fs.Stats,
  md5sum: string,
  wip?: true
}
export type LocalFileDeletion = {
  sideName: 'local',
  type: 'FileDeletion',
  path: string,
  old?: Metadata,
  ino?: number
}
export type LocalFileMove = {
  sideName: 'local',
  type: 'FileMove',
  path: string,
  old: Metadata,
  ino: number,
  stats: fs.Stats,
  md5sum: string,
  wip?: true,
  needRefetch?: boolean,
  update?: LocalFileUpdated,
  overwrite?: Metadata
}
export type LocalFileUpdate = {
  sideName: 'local',
  type: 'FileUpdate',
  path: string,
  old?: Metadata,
  ino: number,
  stats: fs.Stats,
  md5sum: string,
  wip?: true
}
export type LocalIgnored = {
  sideName: 'local',
  type: 'Ignored',
  path: string
}

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

function dirAddition (e /*: LocalDirAdded */) /*: LocalDirAddition */ {
  log.debug({path: e.path}, 'addDir = DirAddition')
  const change /*: LocalDirAddition */ = {
    sideName,
    type: 'DirAddition',
    path: e.path,
    stats: e.stats,
    ino: e.stats.ino
  }
  if (e.old) change.old = e.old
  if (e.wip) change.wip = e.wip
  return change
}

function dirDeletion (e /*: LocalDirUnlinked */) /*: LocalDirDeletion */ {
  log.debug({path: e.path}, 'unlinkDir = DirDeletion')
  const change /*: LocalDirDeletion */ = {
    sideName,
    type: 'DirDeletion',
    path: e.path
  }
  if (e.old) change.old = e.old
  if (e.old && e.old.ino) change.ino = e.old.ino
  return change
}

function fileAddition (e /*: LocalFileAdded */) /*: LocalFileAddition */ {
  log.debug({path: e.path}, 'add = FileAddition')
  const change /*: LocalFileAddition */ = {
    sideName,
    type: 'FileAddition',
    path: e.path,
    stats: e.stats,
    ino: e.stats.ino,
    md5sum: e.md5sum
  }
  if (e.old) change.old = e.old
  if (e.wip) change.wip = e.wip
  return change
}

function fileDeletion (e /*: LocalFileUnlinked */) /*: LocalFileDeletion */ {
  log.debug({path: e.path}, 'unlink = FileDeletion')
  const change /*: LocalFileDeletion */ = {
    sideName,
    type: 'FileDeletion',
    path: e.path
  }
  if (e.old) change.old = e.old
  if (e.old && e.old.ino) change.ino = e.old.ino
  return change
}

function fileUpdate (e /*: LocalFileUpdated */) /*: LocalFileUpdate */ {
  log.debug({path: e.path}, 'change = FileUpdate')
  const change /*: LocalFileUpdate */ = {
    sideName,
    type: 'FileUpdate',
    path: e.path,
    stats: e.stats,
    ino: e.stats.ino,
    md5sum: e.md5sum
  }
  if (e.old) change.old = e.old
  if (e.wip) change.wip = e.wip
  return change
}

function fileMoveFromUnlinkAdd (sameInodeChange /*: ?LocalChange */, e /*: LocalFileAdded */) /*: * */ {
  const unlinkChange /*: ?LocalFileDeletion */ = maybeDeleteFile(sameInodeChange)
  if (!unlinkChange) return
  if (_.get(unlinkChange, 'old.path') === e.path) return fileAddition(e)
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
  if (_.get(unlinkChange, 'old.path') === e.path) return dirAddition(e)
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

function fileMoveFromFileDeletionChange (fileDeletion /* :LocalFileDeletion */, e /* : LocalFileUpdated */) {
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

function dirMoveFromAddUnlink (addChange /*: LocalDirAddition */, e /*: LocalDirUnlinked */) /*: * */ {
  log.debug({oldpath: e.path, path: addChange.path}, 'addDir + unlinkDir = DirMove')
  return build('DirMove', addChange.path, {
    stats: addChange.stats,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })
}

function fileMoveIdentical (addChange /*: LocalFileAddition */, e /*: LocalFileUpdated */) /*: * */ {
  log.debug({oldpath: e.path, path: addChange.path}, 'add + change = FileMove (same id)')
  return build('FileMove', addChange.path, {
    stats: e.stats,
    md5sum: e.md5sum,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })
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

function dirRenamingCaseOnlyFromAddAdd (addChange /*: LocalDirAddition */, e /*: LocalDirAdded */) /*: * */ {
  log.debug({oldpath: addChange.path, path: e.path}, 'addDir + addDir = DirMove (same id)')
  return build('DirMove', e.path, {
    stats: addChange.stats,
    old: addChange.old,
    ino: addChange.ino,
    wip: e.wip
  })
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

function includeAddEventInFileMove (moveChange /*: LocalFileMove */, e /*: LocalFileAdded */) {
  if (!moveChange.wip &&
       moveChange.path === e.path &&
       moveChange.stats.ino === e.stats.ino &&
       moveChange.md5sum === e.md5sum) return
  moveChange.path = e.path
  moveChange.stats = e.stats
  moveChange.md5sum = e.md5sum

  if (e.md5sum) {
    delete moveChange.wip
    log.debug(
      {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
      'FileMove + add = FileMove')
  } else {
    moveChange.wip = true
    log.debug(
      {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
      'FileMove + add without checksum = FileMove wip')
  }
}

function includeAddDirEventInDirMove (moveChange /*: LocalDirMove */, e /*: LocalDirAdded */) {
  if (!moveChange.wip &&
       moveChange.path === e.path &&
       moveChange.stats.ino === e.stats.ino
     ) {
    // FIXME This is based on a bug in chokidar where
    // an overwriting move have two addDir events on mac+APFS
    // but no unlinkDir for the overwritten destination.
    log.debug(
      {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
      'DirMove(a, b) + addDir(b) = DirMove.overwrite(a, b) [chokidar bug]')
    moveChange.overwrite = true
    return
  }
  if (moveChange.old.path === e.path) {
    log.debug(
      {path: moveChange.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
      `DirMove(a, b) + addDir(a) = Ignored(b, a) (identical renaming loopback)`)
    // $FlowFixMe
    moveChange.type = 'Ignored'
    return
  }
  moveChange.path = e.path
  moveChange.stats = e.stats
  if (!e.wip) {
    delete moveChange.wip
    log.debug(
     {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
     'DirMove + addDir = DirMove')
  } else {
    moveChange.wip = true
    log.debug(
      {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
      'DirMove + addDir wip = DirMove wip')
  }
}

function includeChangeEventIntoFileMove (moveChange /*: LocalFileMove */, e /*: LocalFileUpdated */) {
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
