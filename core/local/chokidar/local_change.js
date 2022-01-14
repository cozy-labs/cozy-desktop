/** A local change as to be fed to Prep/Merge.
 *
 * Ended up being specific to ChokidarWatcher.
 *
 * @module core/local/chokidar/local_change
 * @flow
 */

const _ = require('lodash')
const path = require('path')

const metadata = require('../../metadata')
const { getInode } = require('./local_event')
const logger = require('../../utils/logger')

/*::
import type fs from 'fs'
import type { Metadata, SavedMetadata } from '../../metadata'
import type {
  LocalDirAdded,
  LocalDirUnlinked,
  LocalEvent,
  LocalFileAdded,
  LocalFileUnlinked,
  LocalFileUpdated
} from './local_event'
*/

module.exports = {
  build,
  maybeAddFile,
  maybePutFolder,
  maybeMoveFile,
  maybeMoveFolder,
  maybeDeleteFile,
  maybeDeleteFolder,
  find,
  addPath,
  delPath,
  updatePath,
  samePath,
  childOf,
  lower,
  isChildMove,
  isChildUpdate,
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
  dirMoveOverwriteOnMacAPFS,
  dirRenamingCaseOnlyFromAddAdd,
  dirRenamingIdenticalLoopback,
  dirMoveIdenticalOffline,
  ignoreDirAdditionThenDeletion,
  ignoreFileAdditionThenDeletion,
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
  sideName: 'local', // TODO: remove this unnecessary attribute
  type: 'DirAddition',
  path: string,
  old?: SavedMetadata,
  ino: number,
  stats: fs.Stats,
  wip?: true
}
export type LocalDirDeletion = {
  sideName: 'local',
  type: 'DirDeletion',
  path: string,
  old?: SavedMetadata,
  ino?: number
}
export type LocalDirMove = {
  sideName: 'local',
  type: 'DirMove',
  path: string,
  old?: SavedMetadata,
  ino?: number,
  stats: fs.Stats,
  wip?: true,
  needRefetch?: boolean,
  overwrite?: boolean
}
export type LocalFileAddition = {
  sideName: 'local',
  type: 'FileAddition',
  path: string,
  old?: SavedMetadata,
  ino: number,
  stats: fs.Stats,
  md5sum: string,
  wip?: true
}
export type LocalFileDeletion = {
  sideName: 'local',
  type: 'FileDeletion',
  path: string,
  old?: SavedMetadata,
  ino?: number
}
export type LocalFileMove = {
  sideName: 'local',
  type: 'FileMove',
  path: string,
  old?: SavedMetadata,
  ino?: number,
  stats: fs.Stats,
  md5sum: string,
  wip?: true,
  needRefetch?: boolean,
  update?: LocalFileAdded|LocalFileUpdated,
  overwrite?: SavedMetadata
}
export type LocalFileUpdate = {
  sideName: 'local',
  type: 'FileUpdate',
  path: string,
  old?: SavedMetadata,
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
function build(
  type /*: string */,
  path /*: string */,
  opts /*: ?{stats?: fs.Stats, md5sum?: string, old?: ?SavedMetadata} */
) /*: LocalChange */ {
  const change /*: Object */ = _.assign({ sideName, type, path }, opts)
  if (change.wip == null) delete change.wip
  if (change.overwrite == null) delete change.overwrite
  if (change.md5sum == null) delete change.md5sum
  return change
}

function maybeAddFile(a /*: ?LocalChange */) /*: ?LocalFileAddition */ {
  return a && a.type === 'FileAddition' ? a : null
}
function maybePutFolder(a /*: ?LocalChange */) /*: ?LocalDirAddition */ {
  return a && a.type === 'DirAddition' ? a : null
}
function maybeMoveFile(a /*: ?LocalChange */) /*: ?LocalFileMove */ {
  return a && a.type === 'FileMove' ? a : null
}
function maybeMoveFolder(a /*: ?LocalChange */) /*: ?LocalDirMove */ {
  return a && a.type === 'DirMove' ? a : null
}
function maybeDeleteFile(a /*: ?LocalChange */) /*: ?LocalFileDeletion */ {
  return a && a.type === 'FileDeletion' ? a : null
}
function maybeDeleteFolder(a /*: ?LocalChange */) /*: ?LocalDirDeletion */ {
  return a && a.type === 'DirDeletion' ? a : null
}

function find /*:: <T> */(
  changes /*: LocalChange[] */,
  maybeRightType /*: (LocalChange) => ?T */,
  predicate /*: (T) => boolean */,
  remove /*: ?true */
) /*: ?T */ {
  for (let i = 0; i < changes.length; i++) {
    const anyChange = changes[i]
    const rightTypeChange /*: ?T */ = maybeRightType(anyChange)
    if (rightTypeChange != null && predicate(rightTypeChange)) {
      if (remove) changes.splice(i, 1)
      return rightTypeChange
    }
  }
}

function isChildMove(
  a /*: LocalChange */,
  b /*: LocalChange */
) /*: boolean %checks */ {
  return (
    a.type === 'DirMove' &&
    (b.type === 'DirMove' || b.type === 'FileMove') &&
    b.path.normalize().startsWith(a.path.normalize() + path.sep) &&
    !!a.old &&
    !!b.old &&
    b.old.path.normalize().startsWith(a.old.path.normalize() + path.sep)
  )
}

const isDelete = (a /*: LocalChange */) /*: boolean %checks */ =>
  a.type === 'DirDeletion' || a.type === 'FileDeletion'
const isAdd = (a /*: LocalChange */) /*: boolean %checks */ =>
  a.type === 'DirAddition' || a.type === 'FileAddition'
const isMove = (a /*: LocalChange */) /*: boolean %checks */ =>
  a.type === 'DirMove' || a.type === 'FileMove'
const isUpdate = (a /*: LocalChange */) /*: boolean %checks */ =>
  a.type === 'FileUpdate'

function addPath(a /*: LocalChange */) /*: ?string */ {
  return isAdd(a) || isMove(a) ? a.path.normalize() : null
}
function delPath(a /*: LocalChange */) /*: ?string */ {
  return isDelete(a)
    ? a.path.normalize()
    : isMove(a) && a.old != null
    ? a.old.path.normalize()
    : null
}
function updatePath(a /*: LocalChange */) /*: ?string */ {
  return isUpdate(a) ? a.path.normalize() : null
}
function samePath(p1 /*: ?string */, p2 /*: ?string */) /*: boolean */ {
  return p1 != null && p2 != null && p1.normalize() === p2.normalize()
}
function childOf(p /*: ?string */, c /*: ?string */) /*: boolean */ {
  return (
    p != null &&
    c != null &&
    c.normalize() !== p.normalize() &&
    c.normalize().startsWith(p.normalize() + path.sep)
  )
}
function lower(p1 /*: ?string */, p2 /*: ?string */) /*: boolean */ {
  return p1 != null && p2 != null && !(p1.normalize() >= p2.normalize())
}

function isChildDelete(a /*: LocalChange */, b /*: LocalChange */) {
  return childOf(delPath(a), delPath(b))
}
function isChildAdd(a /*: LocalChange */, b /*: LocalChange */) {
  return childOf(addPath(a), addPath(b))
}
function isChildUpdate(a /*: LocalChange */, b /*: LocalChange */) {
  return childOf(addPath(a), updatePath(b))
}

function toString(a /*: LocalChange */) /*: string */ {
  // $FlowFixMe
  return '(' + a.type + ': ' + (a.old && a.old.path) + '-->' + a.path + ')'
}

function fileHasChanged(
  old /*: ?Metadata */,
  e /*: LocalFileAdded */
) /*: boolean */ {
  return (
    old != null &&
    old.local != null &&
    e.md5sum != null &&
    e.stats != null &&
    e.md5sum !== old.md5sum &&
    e.stats.mtime.toISOString() !== old.local.updated_at
  )
}

function dirAddition(
  e /*: LocalDirAdded */
) /*: { change: LocalDirAddition, previousChange: null } */ {
  const change /*: LocalDirAddition */ = {
    sideName,
    type: 'DirAddition',
    path: e.path,
    stats: e.stats,
    ino: e.stats.ino
  }
  if (e.old) change.old = e.old
  if (e.wip) change.wip = e.wip

  log.debug(
    { path: change.path, ino: change.ino, wip: change.wip },
    'addDir = DirAddition'
  )

  return { change, previousChange: null }
}

function dirDeletion(
  e /*: LocalDirUnlinked */
) /*: ?{ change: LocalDirDeletion, previousChange: null } */ {
  if (!getInode(e)) return

  const change /*: LocalDirDeletion */ = {
    sideName,
    type: 'DirDeletion',
    path: e.path
  }
  if (e.old) change.old = e.old
  if (e.old && e.old.ino) change.ino = e.old.ino

  log.debug({ path: change.path, ino: change.ino }, 'unlinkDir = DirDeletion')

  return { change, previousChange: null }
}

function fileAddition(
  e /*: LocalFileAdded */
) /*: { change: LocalFileAddition, previousChange: null } */ {
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

  log.debug(
    { path: change.path, ino: change.ino, wip: change.wip },
    'add = FileAddition'
  )

  return { change, previousChange: null }
}

function fileDeletion(
  e /*: LocalFileUnlinked */
) /*: ?{ change: LocalFileDeletion, previousChange: null } */ {
  if (!getInode(e)) return

  const change /*: LocalFileDeletion */ = {
    sideName,
    type: 'FileDeletion',
    path: e.path
  }

  if (e.old) change.old = e.old
  if (e.old && e.old.ino) change.ino = e.old.ino

  log.debug({ path: change.path, ino: change.ino }, 'unlink = FileDeletion')

  return { change, previousChange: null }
}

function fileUpdate(
  e /*: LocalFileUpdated */
) /*: { change: LocalFileUpdate, previousChange: null } */ {
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

  log.debug(
    { path: change.path, ino: change.ino, wip: change.wip },
    'change = FileUpdate'
  )

  return { change, previousChange: null }
}

function fileMoveFromUnlinkAdd(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileAdded */
) /*: ?{ change: LocalFileMove, previousChange: LocalFileDeletion } */ {
  const unlinkChange /*: ?LocalFileDeletion */ =
    maybeDeleteFile(sameInodeChange)
  if (!unlinkChange) return

  const { old, ino } = unlinkChange
  if (old && old.path.normalize() === e.path.normalize()) return

  const md5sum =
    old != null && old.md5sum != null && !fileHasChanged(old, e)
      ? old.md5sum
      : e.md5sum
  const fileMove /*: LocalFileMove */ = {
    sideName,
    type: 'FileMove',
    path: e.path,
    stats: e.stats,
    md5sum
  }

  if (e.wip) fileMove.wip = true
  if (old) fileMove.old = old
  if (ino) fileMove.ino = ino
  if (md5sum === e.md5sum) fileMove.update = e

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    `unlink + add = FileMove${fileMove.update ? '(update)' : ''}`
  )

  return { change: fileMove, previousChange: unlinkChange }
}

function dirMoveFromUnlinkAdd(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) /*: ?{ change: LocalDirMove, previousChange: LocalDirDeletion } */ {
  const unlinkChange /*: ?LocalDirDeletion */ =
    maybeDeleteFolder(sameInodeChange)
  if (!unlinkChange) return

  const { old, ino } = unlinkChange
  if (old && old.path.normalize() === e.path.normalize()) return

  const dirMove /*: LocalDirMove */ = {
    sideName,
    type: 'DirMove',
    path: e.path,
    stats: e.stats
  }

  if (e.wip) dirMove.wip = true
  if (old) dirMove.old = old
  if (ino) dirMove.ino = ino

  log.debug(
    {
      oldpath: dirMove.old && dirMove.old.path,
      path: dirMove.path,
      ino: dirMove.ino,
      wip: dirMove.wip
    },
    `unlinkDir + addDir  = DirMove`
  )

  return { change: dirMove, previousChange: unlinkChange }
}

function fileMoveFromAddUnlink(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUnlinked */
) /*: ?{ change: LocalFileMove, previousChange: LocalFileAddition } */ {
  const addChange /*: ?LocalFileAddition */ = maybeAddFile(sameInodeChange)
  if (!addChange) return

  const fileMove /*: LocalFileMove */ = {
    sideName,
    type: 'FileMove',
    path: addChange.path,
    stats: addChange.stats,
    md5sum: addChange.md5sum,
    ino: addChange.ino
  }

  if (addChange.wip) fileMove.wip = true
  if (e.old) fileMove.old = e.old
  if (addChange.old) fileMove.overwrite = addChange.old

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    `add  + unlink = FileMove`
  )

  return { change: fileMove, previousChange: addChange }
}

function fileMoveFromFileDeletionChange(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUpdated */
) /*: ?{ change: LocalFileMove, previousChange: LocalFileDeletion } */ {
  const fileDeletion /*: ?LocalFileDeletion */ =
    maybeDeleteFile(sameInodeChange)
  if (!fileDeletion) return

  // There was an unlink on the same file, this is most probably a move and replace
  const src = fileDeletion.old
  const dst = e.old
  const newDst = e

  const fileMove /*: LocalFileMove */ = {
    sideName,
    type: 'FileMove',
    path: e.path,
    old: src,
    stats: newDst.stats,
    ino: newDst.stats.ino,
    md5sum: newDst.md5sum
  }

  if (e.wip) fileMove.wip = true
  if (dst) fileMove.overwrite = dst

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    'unlink(src) + change(dst -> newDst) = FileMove.overwrite(src, newDst)'
  )

  return { change: fileMove, previousChange: fileDeletion }
}

function dirMoveFromAddUnlink(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirUnlinked */
) /*: ?{ change: LocalDirMove, previousChange: LocalDirAddition } */ {
  const addChange /*: ?LocalDirAddition */ = maybePutFolder(sameInodeChange)
  if (!addChange) return

  const dirMove /*: LocalDirMove */ = {
    sideName,
    type: 'DirMove',
    path: addChange.path,
    stats: addChange.stats,
    ino: addChange.ino
  }

  if (addChange.wip) dirMove.wip = true
  if (e.old) dirMove.old = e.old
  if (addChange.old) dirMove.overwrite = true

  log.debug(
    {
      oldpath: dirMove.old && dirMove.old.path,
      path: dirMove.path,
      ino: dirMove.ino,
      wip: dirMove.wip
    },
    'addDir + unlinkDir = DirMove'
  )

  return { change: dirMove, previousChange: addChange }
}

function fileMoveIdentical(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUpdated */
) /*: ?{ change: LocalFileMove, previousChange: LocalFileAddition } */ {
  const addChange /*: ?LocalFileAddition */ = maybeAddFile(sameInodeChange)
  if (
    !addChange ||
    metadata.id(addChange.path) !== metadata.id(e.path) ||
    addChange.path.normalize() === e.path.normalize()
  )
    return

  const fileMove /*: LocalFileMove */ = {
    sideName,
    type: 'FileMove',
    path: addChange.path,
    stats: e.stats,
    md5sum: e.md5sum,
    ino: addChange.ino
  }

  if (e.wip) fileMove.wip = true
  if (e.old) fileMove.old = e.old

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    'add + change = FileMove (same id)'
  )

  return { change: fileMove, previousChange: addChange }
}

function fileMoveIdenticalOffline(
  dstEvent /*: LocalFileAdded */
) /*: ?{ change: LocalFileMove, previousChange: null } */ {
  const srcDoc = dstEvent.old
  if (
    !srcDoc ||
    srcDoc.path.normalize() === dstEvent.path.normalize() ||
    srcDoc.ino !== dstEvent.stats.ino
  )
    return

  const fileMove /*: LocalFileMove */ = {
    sideName,
    type: 'FileMove',
    path: dstEvent.path,
    stats: dstEvent.stats,
    md5sum: dstEvent.md5sum,
    old: srcDoc,
    ino: dstEvent.stats.ino,
    wip: dstEvent.wip
  }

  log.debug(
    {
      // $FlowFixMe: fileMove.old is not null since srcDoc is not null
      oldpath: fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    'add = FileMove (same id, offline)'
  )

  return { change: fileMove, previousChange: null }
}

function dirRenamingCaseOnlyFromAddAdd(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) /*: ?{ change: LocalDirMove, previousChange: LocalDirAddition } */ {
  const addChange /*: ?LocalDirAddition */ = maybePutFolder(sameInodeChange)
  if (
    !addChange ||
    metadata.id(addChange.path) !== metadata.id(e.path) ||
    addChange.path.normalize() === e.path.normalize()
  ) {
    return
  }

  const dirMove /*: LocalDirMove */ = {
    sideName,
    type: 'DirMove',
    path: e.path,
    stats: addChange.stats,
    ino: addChange.ino
  }

  if (e.wip) dirMove.wip = true
  if (addChange.old) dirMove.old = addChange.old

  log.debug(
    {
      oldpath: dirMove.old && dirMove.old.path,
      path: dirMove.path,
      ino: dirMove.ino,
      wip: dirMove.wip
    },
    'addDir + addDir = DirMove (same id)'
  )

  return { change: dirMove, previousChange: addChange }
}

function dirMoveIdenticalOffline(
  dstEvent /*: LocalDirAdded */
) /*: ?{ change: LocalDirMove, previousChange: null } */ {
  const srcDoc = dstEvent.old
  if (
    !srcDoc ||
    srcDoc.path.normalize() === dstEvent.path.normalize() ||
    srcDoc.ino !== dstEvent.stats.ino
  )
    return

  const dirMove /*: LocalDirMove */ = {
    sideName,
    type: 'DirMove',
    path: dstEvent.path,
    old: srcDoc,
    stats: dstEvent.stats,
    ino: dstEvent.stats.ino
  }

  if (dstEvent.wip) dirMove.wip = true

  log.debug(
    {
      // $FlowFixMe: dirMove.old is not null since srcDoc is not null
      oldpath: dirMove.old.path,
      path: dirMove.path,
      ino: dirMove.ino,
      wip: dirMove.wip
    },
    'addDir = DirMove (same id, offline)'
  )

  return { change: dirMove, previousChange: null }
}

/*::
export type LocalMove = LocalFileMove|LocalDirMove
export type LocalMoveEvent = LocalFileAdded|LocalDirAdded
*/

function includeAddEventInFileMove(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileAdded */
) /*: ?{ change: LocalFileMove, previousChange: LocalFileMove } */ {
  const moveChange /*: ?LocalFileMove */ = maybeMoveFile(sameInodeChange)
  if (!moveChange) return
  if (
    !moveChange.wip &&
    moveChange.path.normalize() === e.path.normalize() &&
    moveChange.ino === e.stats.ino &&
    moveChange.md5sum === e.md5sum
  )
    return

  const newMove /*: LocalFileMove */ = {
    sideName,
    type: 'FileMove',
    path: e.path,
    stats: e.stats,
    ino: e.stats.ino,
    old: moveChange.old,
    md5sum: e.md5sum,
    update: e
  }

  if (!newMove.md5sum) newMove.wip = true
  if (moveChange.overwrite) newMove.overwrite = moveChange.overwrite

  log.debug(
    {
      oldpath: newMove.old && newMove.old.path,
      path: newMove.path,
      ino: newMove.ino,
      wip: newMove.wip
    },
    'FileMove + add = FileMove'
  )

  return { change: newMove, previousChange: moveChange }
}

/**
 * This is based on a bug in chokidar on macOS + APFS where an overwriting
 * move has two addDir events but no unlinkDir for the overwritten destination.
 */
function dirMoveOverwriteOnMacAPFS(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) /*: ?{ change: LocalDirMove, previousChange: LocalDirMove } */ {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(sameInodeChange)
  if (!moveChange) return
  if (
    !moveChange.wip &&
    moveChange.path.normalize() === e.path.normalize() &&
    moveChange.stats.ino === e.stats.ino
  ) {
    const newMove /*: LocalDirMove */ = {
      sideName,
      type: 'DirMove',
      path: moveChange.path,
      old: moveChange.old,
      ino: moveChange.ino,
      stats: moveChange.stats,
      overwrite: true
    }

    if (moveChange.wip) newMove.wip = true
    if (moveChange.needRefetch) newMove.needRefetch = true

    log.debug(
      {
        oldpath: newMove.old && newMove.old.path,
        path: newMove.path,
        ino: newMove.ino
      },
      'DirMove(a, b) + addDir(b) = DirMove.overwrite(a, b) [chokidar bug]'
    )

    return { change: newMove, previousChange: moveChange }
  }
}

function dirRenamingIdenticalLoopback(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) /*: ?{ change: LocalIgnored, previousChange: LocalDirMove } */ {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(sameInodeChange)
  if (
    !moveChange ||
    !moveChange.old ||
    moveChange.old.path.normalize() !== e.path.normalize()
  )
    return

  const ignored /*: LocalIgnored */ = {
    sideName,
    type: 'Ignored',
    path: moveChange.path
  }

  log.debug(
    {
      oldpath: moveChange.old && moveChange.old.path,
      path: ignored.path,
      ino: moveChange.ino
    },
    `DirMove(a, b) + addDir(a) = Ignored(b, a) (identical renaming loopback)`
  )

  return { change: ignored, previousChange: moveChange }
}

function includeAddDirEventInDirMove(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) /*: ?{ change: LocalDirMove, previousChange: LocalDirMove } */ {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(sameInodeChange)
  if (!moveChange) return

  const newMove /*: LocalDirMove */ = {
    sideName,
    type: 'DirMove',
    path: e.path,
    old: moveChange.old,
    stats: e.stats,
    ino: e.stats.ino
  }

  if (e.wip) newMove.wip = true
  if (moveChange.needRefetch) newMove.needRefetch = true
  if (moveChange.overwrite) newMove.overwrite = true

  log.debug(
    {
      oldpath: newMove.old && newMove.old.path,
      path: newMove.path,
      ino: newMove.ino,
      wip: newMove.wip
    },
    'DirMove + addDir = DirMove'
  )
  return { change: newMove, previousChange: moveChange }
}

function includeChangeEventIntoFileMove(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUpdated */
) /*: ?{ change: LocalFileMove, previousChange: LocalFileMove } */ {
  const moveChange /*: ?LocalFileMove */ = maybeMoveFile(sameInodeChange)
  if (!moveChange) return

  const newMove /*: LocalFileMove */ = {
    sideName,
    type: 'FileMove',
    path: moveChange.path,
    stats: e.stats,
    ino: e.stats.ino,
    md5sum: e.md5sum,
    update: _.defaults(
      {
        // In almost all cases, change event has the destination path.
        // But on macOS identical renaming, it has the source path.
        // So we make sure the file change being merged after the move
        // won't erase the destination path with the source one.
        // Should be a no-op on all other cases anyway, since e.path
        // should already be the same as moveChange.path
        path: moveChange.path
      },
      e
    )
  }

  if (e.wip) newMove.wip = true
  if (moveChange.needRefetch) newMove.needRefetch = true
  if (moveChange.old) newMove.old = moveChange.old
  if (moveChange.overwrite) newMove.overwrite = moveChange.overwrite

  log.debug(
    {
      oldPath: newMove.old && newMove.old.path,
      path: newMove.path,
      ino: newMove.ino
    },
    'FileMove + change'
  )

  return { change: newMove, previousChange: moveChange }
}

function convertFileMoveToDeletion(
  samePathChange /*: ?LocalChange */
) /*: ?{ change: LocalFileDeletion, previousChange: LocalFileMove } */ {
  const moveChange /*: ?LocalFileMove */ = maybeMoveFile(samePathChange)
  if (!moveChange || !moveChange.wip || !moveChange.old) return

  const deletion /*: LocalFileDeletion */ = {
    sideName,
    type: 'FileDeletion',
    path: moveChange.old.path,
    old: moveChange.old,
    ino: moveChange.ino
  }

  log.debug(
    { path: deletion.path, ino: deletion.ino },
    'FileMove + unlink = FileDeletion'
  )

  return { change: deletion, previousChange: moveChange }
}

function convertDirMoveToDeletion(
  samePathChange /*: ?LocalChange */
) /*: ?{ change: LocalDirDeletion, previousChange: LocalDirMove } */ {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(samePathChange)
  if (!moveChange || !moveChange.wip || !moveChange.old) return

  const deletion /*: LocalDirDeletion */ = {
    sideName,
    type: 'DirDeletion',
    path: moveChange.old.path,
    old: moveChange.old,
    ino: moveChange.ino
  }

  log.debug(
    { path: deletion.path, ino: deletion.ino },
    'DirMove + unlinkDir = DirDeletion'
  )

  return { change: deletion, previousChange: moveChange }
}

function ignoreDirAdditionThenDeletion(
  samePathChange /*: ?LocalChange */
) /*: ?{ change: LocalIgnored, previousChange: LocalDirAddition } */ {
  const addChange /*: ?LocalDirAddition */ = maybePutFolder(samePathChange)
  if (!addChange || !addChange.wip) return

  const ignored /*: LocalIgnored */ = {
    sideName,
    type: 'Ignored',
    path: addChange.path
  }

  log.debug(
    { path: addChange.path, ino: addChange.ino },
    'Folder was added then deleted. Ignoring add.'
  )

  return { change: ignored, previousChange: addChange }
}

function ignoreFileAdditionThenDeletion(
  samePathChange /*: ?LocalChange */
) /*: ?{ change: LocalIgnored, previousChange: LocalFileAddition } */ {
  const addChange /*: ?LocalFileAddition */ = maybeAddFile(samePathChange)
  if (!addChange || !addChange.wip) return

  const ignored /*: LocalIgnored */ = {
    sideName,
    type: 'Ignored',
    path: addChange.path
  }

  log.debug(
    { path: ignored.path, ino: addChange.ino },
    'File was added then deleted. Ignoring add.'
  )

  return { change: ignored, previousChange: addChange }
}
