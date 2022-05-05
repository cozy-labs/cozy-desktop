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
  fileRenamingCaseOnlyFromAddAdd,
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
  ignoreUnmergedDirMoveThenDeletion,
  ignoreUnmergedFileMoveThenDeletion,
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
  old: SavedMetadata,
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
  old: SavedMetadata,
  ino: number,
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
    : isMove(a) && a.old
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

function dirAddition(e /*: LocalDirAdded */) /*: LocalDirAddition */ {
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

  return change
}

function dirDeletion(e /*: LocalDirUnlinked */) /*: ?LocalDirDeletion */ {
  if (!getInode(e)) return
  const change /*: LocalDirDeletion */ = {
    sideName,
    type: 'DirDeletion',
    path: e.path
  }
  if (e.old) change.old = e.old
  if (e.old && e.old.ino) change.ino = e.old.ino

  log.debug({ path: change.path, ino: change.ino }, 'unlinkDir = DirDeletion')

  return change
}

function fileAddition(e /*: LocalFileAdded */) /*: LocalFileAddition */ {
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

  return change
}

function fileDeletion(e /*: LocalFileUnlinked */) /*: ?LocalFileDeletion */ {
  if (!getInode(e)) return
  const change /*: LocalFileDeletion */ = {
    sideName,
    type: 'FileDeletion',
    path: e.path
  }
  if (e.old) change.old = e.old
  if (e.old && e.old.ino) change.ino = e.old.ino

  log.debug({ path: change.path, ino: change.ino }, 'unlink = FileDeletion')

  return change
}

function fileUpdate(e /*: LocalFileUpdated */) /*: LocalFileUpdate */ {
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

  return change
}

function fileMoveFromUnlinkAdd(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileAdded */
) /*: * */ {
  const unlinkChange /*: ?LocalFileDeletion */ =
    maybeDeleteFile(sameInodeChange)
  if (!unlinkChange) return
  if (
    unlinkChange.old &&
    unlinkChange.old.path.normalize() === e.path.normalize()
  )
    return
  const fileMove /*: Object */ = build('FileMove', e.path, {
    stats: e.stats,
    old: unlinkChange.old,
    ino: unlinkChange.ino,
    wip: e.wip
  })
  if (fileHasChanged(unlinkChange.old, e) || !unlinkChange.old) {
    fileMove.update = e
    fileMove.md5sum = e.md5sum
  } else {
    fileMove.md5sum = unlinkChange.old.md5sum
  }

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    `unlink + add = FileMove${fileMove.update ? '(update)' : ''}`
  )

  return fileMove
}

function dirMoveFromUnlinkAdd(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) /*: * */ {
  const unlinkChange /*: ?LocalDirDeletion */ =
    maybeDeleteFolder(sameInodeChange)
  if (!unlinkChange) return
  if (
    unlinkChange.old &&
    unlinkChange.old.path.normalize() === e.path.normalize()
  )
    return
  const dirMove /*: Object */ = build('DirMove', e.path, {
    stats: e.stats,
    old: unlinkChange.old,
    ino: unlinkChange.ino,
    wip: e.wip
  })

  log.debug(
    {
      oldpath: dirMove.old && dirMove.old.path,
      path: dirMove.path,
      ino: dirMove.ino,
      wip: dirMove.wip
    },
    `unlinkDir + addDir  = DirMove`
  )

  return dirMove
}

function fileMoveFromAddUnlink(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUnlinked */
) /*: * */ {
  const addChange /*: ?LocalFileAddition */ = maybeAddFile(sameInodeChange)
  if (!addChange) return
  const fileMove /*: Object */ = build('FileMove', addChange.path, {
    stats: addChange.stats,
    md5sum: addChange.md5sum,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    `add  + unlink = FileMove`
  )

  return fileMove
}

function fileMoveFromFileDeletionChange(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUpdated */
) {
  const fileDeletion /*: ?LocalFileDeletion */ =
    maybeDeleteFile(sameInodeChange)
  if (!fileDeletion) return
  // There was an unlink on the same file, this is most probably a move and replace
  const src = fileDeletion.old
  const dst = e.old
  const newDst = e

  const fileMove /*: Object */ = build('FileMove', e.path, {
    stats: newDst.stats,
    md5sum: newDst.md5sum,
    overwrite: dst,
    old: src,
    ino: newDst.stats.ino,
    wip: e.wip
  })

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    'unlink(src) + change(dst -> newDst) = FileMove.overwrite(src, newDst)'
  )

  return fileMove
}

function dirMoveFromAddUnlink(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirUnlinked */
) /*: * */ {
  const addChange /*: ?LocalDirAddition */ = maybePutFolder(sameInodeChange)
  if (!addChange) return

  const dirMove /*: Object */ = build('DirMove', addChange.path, {
    stats: addChange.stats,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })

  log.debug(
    {
      oldpath: dirMove.old && dirMove.old.path,
      path: dirMove.path,
      ino: dirMove.ino,
      wip: dirMove.wip
    },
    'addDir + unlinkDir = DirMove'
  )

  return dirMove
}

function fileMoveIdentical(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUpdated */
) /*: * */ {
  const addChange /*: ?LocalFileAddition */ = maybeAddFile(sameInodeChange)
  if (
    !addChange ||
    metadata.id(addChange.path) !== metadata.id(e.path) ||
    addChange.path.normalize() === e.path.normalize()
  )
    return

  const fileMove /*: Object */ = build('FileMove', addChange.path, {
    stats: e.stats,
    md5sum: e.md5sum,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    'add + change = FileMove (same id)'
  )

  return fileMove
}

function fileRenamingCaseOnlyFromAddAdd(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileAdded */
) /*: * */ {
  const addChange /*: ?LocalFileAddition */ = maybeAddFile(sameInodeChange)
  if (
    !addChange ||
    metadata.id(addChange.path) !== metadata.id(e.path) ||
    addChange.path.normalize() === e.path.normalize()
  ) {
    return
  }

  const fileMove /*: Object */ = build('FileMove', e.path, {
    stats: addChange.stats,
    old: addChange.old,
    ino: addChange.ino,
    md5sum: e.md5sum,
    wip: e.wip
  })

  log.debug(
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    'add + add = FileMove (same id)'
  )

  return fileMove
}

function fileMoveIdenticalOffline(
  dstEvent /*: LocalFileAdded */
) /*: ?LocalFileMove */ {
  const srcDoc = dstEvent.old
  if (
    !srcDoc ||
    srcDoc.path.normalize() === dstEvent.path.normalize() ||
    srcDoc.ino !== dstEvent.stats.ino
  )
    return

  const fileMove /*: Object */ = build('FileMove', dstEvent.path, {
    stats: dstEvent.stats,
    md5sum: dstEvent.md5sum,
    old: srcDoc,
    ino: dstEvent.stats.ino,
    wip: dstEvent.wip
  })

  log.debug(
    {
      oldpath: fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    },
    'add = FileMove (same id, offline)'
  )

  return fileMove
}

function dirRenamingCaseOnlyFromAddAdd(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) /*: * */ {
  const addChange /*: ?LocalDirAddition */ = maybePutFolder(sameInodeChange)
  if (
    !addChange ||
    metadata.id(addChange.path) !== metadata.id(e.path) ||
    addChange.path.normalize() === e.path.normalize()
  ) {
    return
  }

  const dirMove /*: Object */ = build('DirMove', e.path, {
    stats: addChange.stats,
    old: addChange.old,
    ino: addChange.ino,
    wip: e.wip
  })

  log.debug(
    {
      oldpath: dirMove.old && dirMove.old.path,
      path: dirMove.path,
      ino: dirMove.ino,
      wip: dirMove.wip
    },
    'addDir + addDir = DirMove (same id)'
  )

  return dirMove
}

function dirMoveIdenticalOffline(
  dstEvent /*: LocalDirAdded */
) /*: ?LocalDirMove */ {
  const srcDoc = dstEvent.old
  if (
    !srcDoc ||
    srcDoc.path.normalize() === dstEvent.path.normalize() ||
    srcDoc.ino !== dstEvent.stats.ino
  )
    return

  const dirMove /*: Object */ = build('DirMove', dstEvent.path, {
    stats: dstEvent.stats,
    old: srcDoc,
    ino: dstEvent.stats.ino,
    wip: dstEvent.wip
  })

  log.debug(
    {
      oldpath: dirMove.old.path,
      path: dirMove.path,
      ino: dirMove.ino,
      wip: dirMove.wip
    },
    'addDir = DirMove (same id, offline)'
  )

  return dirMove
}

/*::
export type LocalMove = LocalFileMove|LocalDirMove
export type LocalMoveEvent = LocalFileAdded|LocalDirAdded
*/

function includeAddEventInFileMove(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileAdded */
) {
  const moveChange /*: ?LocalFileMove */ = maybeMoveFile(sameInodeChange)
  if (!moveChange) return
  if (
    !moveChange.wip &&
    moveChange.path.normalize() === e.path.normalize() &&
    moveChange.ino === e.stats.ino &&
    moveChange.md5sum === e.md5sum
  )
    return
  moveChange.path = e.path
  moveChange.stats = e.stats
  moveChange.ino = e.stats.ino
  moveChange.md5sum = e.md5sum

  if (e.md5sum) {
    delete moveChange.wip
  } else {
    moveChange.wip = true
  }

  log.debug(
    {
      oldpath: moveChange.old && moveChange.old.path,
      path: moveChange.path,
      ino: moveChange.ino,
      wip: moveChange.wip
    },
    'FileMove + add = FileMove'
  )

  return true
}

/**
 * This is based on a bug in chokidar on macOS + APFS where an overwriting
 * move has two addDir events but no unlinkDir for the overwritten destination.
 */
function dirMoveOverwriteOnMacAPFS(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(sameInodeChange)
  if (!moveChange) return
  if (
    !moveChange.wip &&
    moveChange.path.normalize() === e.path.normalize() &&
    moveChange.stats.ino === e.stats.ino
  ) {
    moveChange.overwrite = true

    log.debug(
      {
        oldpath: moveChange.old && moveChange.old.path,
        path: moveChange.path,
        ino: moveChange.ino
      },
      'DirMove(a, b) + addDir(b) = DirMove.overwrite(a, b) [chokidar bug]'
    )

    return true
  }
}

function dirRenamingIdenticalLoopback(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(sameInodeChange)
  if (!moveChange) return
  if (
    moveChange.old &&
    moveChange.old.path.normalize() === e.path.normalize()
  ) {
    // $FlowFixMe
    moveChange.type = 'Ignored'

    log.debug(
      {
        oldpath: moveChange.old && moveChange.old.path,
        path: moveChange.path,
        ino: moveChange.ino
      },
      `DirMove(a, b) + addDir(a) = Ignored(b, a) (identical renaming loopback)`
    )

    return true
  }
}

function includeAddDirEventInDirMove(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(sameInodeChange)
  if (!moveChange) return
  moveChange.path = e.path
  moveChange.stats = e.stats
  moveChange.ino = e.stats.ino

  if (!e.wip) {
    delete moveChange.wip
  } else {
    moveChange.wip = true
  }

  log.debug(
    {
      oldpath: moveChange.old && moveChange.old.path,
      path: moveChange.path,
      ino: moveChange.ino,
      wip: moveChange.wip
    },
    'DirMove + addDir = DirMove'
  )
  return true
}

function includeChangeEventIntoFileMove(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUpdated */
) {
  const moveChange /*: ?LocalFileMove */ = maybeMoveFile(sameInodeChange)
  if (!moveChange) return
  moveChange.md5sum = e.md5sum
  moveChange.update = _.defaults(
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
  moveChange.stats = e.stats
  moveChange.ino = e.stats.ino

  log.debug(
    {
      oldPath: moveChange.old && moveChange.old.path,
      path: moveChange.path,
      ino: moveChange.ino
    },
    'FileMove + change'
  )

  return true
}

function convertFileMoveToDeletion(samePathChange /*: ?LocalChange */) {
  const change /*: ?LocalFileMove */ = maybeMoveFile(samePathChange)
  if (change && change.wip && change.old) {
    // $FlowFixMe
    change.type = 'FileDeletion'
    change.path = change.old.path
    delete change.md5sum
    delete change.stats
    delete change.wip

    log.debug(
      { path: change.path, ino: change.ino },
      'FileMove + unlink = FileDeletion'
    )

    return true
  }
}

function convertDirMoveToDeletion(samePathChange /*: ?LocalChange */) {
  const change /*: ?LocalDirMove */ = maybeMoveFolder(samePathChange)
  if (change && change.wip && change.old) {
    // $FlowFixMe
    change.type = 'DirDeletion'
    change.path = change.old.path
    delete change.stats
    delete change.wip

    log.debug(
      { path: change.path, ino: change.ino },
      'DirMove + unlinkDir = DirDeletion'
    )

    return true
  }
}

function ignoreDirAdditionThenDeletion(samePathChange /*: ?LocalChange */) {
  const addChangeSamePath /*: ?LocalDirAddition */ =
    maybePutFolder(samePathChange)
  if (addChangeSamePath && addChangeSamePath.wip) {
    // $FlowFixMe
    addChangeSamePath.type = 'Ignored'

    log.debug(
      { path: addChangeSamePath.path, ino: addChangeSamePath.ino },
      'Folder was added then deleted. Ignoring add.'
    )

    return true
  }
}

function ignoreFileAdditionThenDeletion(samePathChange /*: ?LocalChange */) {
  const addChangeSamePath /*: ?LocalFileAddition */ =
    maybeAddFile(samePathChange)
  if (addChangeSamePath && addChangeSamePath.wip) {
    // $FlowFixMe
    addChangeSamePath.type = 'Ignored'
    delete addChangeSamePath.wip
    delete addChangeSamePath.md5sum

    log.debug(
      { path: addChangeSamePath.path, ino: addChangeSamePath.ino },
      'File was added then deleted. Ignoring add.'
    )

    return true
  }
}

function ignoreUnmergedDirMoveThenDeletion(samePathChange /*: ?LocalChange */) {
  const moveChangeSamePath /*: ?LocalDirMove */ =
    maybeMoveFolder(samePathChange)
  if (moveChangeSamePath && !moveChangeSamePath.old) {
    // $FlowFixMe
    moveChangeSamePath.type = 'Ignored'
    delete moveChangeSamePath.wip

    log.debug(
      { path: moveChangeSamePath.path, ino: moveChangeSamePath.ino },
      'Folder was added then moved then deleted. Ignoring.'
    )

    return true
  }
}

function ignoreUnmergedFileMoveThenDeletion(
  samePathChange /*: ?LocalChange */
) {
  const moveChangeSamePath /*: ?LocalFileMove */ = maybeMoveFile(samePathChange)
  if (moveChangeSamePath && !moveChangeSamePath.old) {
    // $FlowFixMe
    moveChangeSamePath.type = 'Ignored'
    delete moveChangeSamePath.wip
    delete moveChangeSamePath.md5sum

    log.debug(
      { path: moveChangeSamePath.path, ino: moveChangeSamePath.ino },
      'File was added then moved then deleted. Ignoring.'
    )

    return true
  }
}
