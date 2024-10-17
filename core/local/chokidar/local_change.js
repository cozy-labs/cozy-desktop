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
const { logger } = require('../../utils/logger')

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

function dirAddition(e /*: LocalDirAdded */) {
  const change /*: LocalDirAddition */ = {
    sideName,
    type: 'DirAddition',
    path: e.path,
    stats: e.stats,
    ino: e.stats.ino
  }
  if (e.old) change.old = e.old
  if (e.wip) change.wip = e.wip

  log.debug('addDir = DirAddition', {
    path: change.path,
    ino: change.ino,
    wip: change.wip
  })

  return [change, undefined]
}

function dirDeletion(e /*: LocalDirUnlinked */) {
  if (!getInode(e)) return
  const change /*: LocalDirDeletion */ = {
    sideName,
    type: 'DirDeletion',
    path: e.path
  }
  if (e.old) change.old = e.old
  if (e.old && e.old.ino) change.ino = e.old.ino

  log.debug('unlinkDir = DirDeletion', { path: change.path, ino: change.ino })

  return [change, undefined]
}

function fileAddition(e /*: LocalFileAdded */) {
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

  log.debug('add = FileAddition', {
    path: change.path,
    ino: change.ino,
    wip: change.wip
  })

  return [change, undefined]
}

function fileDeletion(e /*: LocalFileUnlinked */) {
  if (!getInode(e)) return
  const change /*: LocalFileDeletion */ = {
    sideName,
    type: 'FileDeletion',
    path: e.path
  }
  if (e.old) change.old = e.old
  if (e.old && e.old.ino) change.ino = e.old.ino

  log.debug('unlink = FileDeletion', { path: change.path, ino: change.ino })

  return [change, undefined]
}

function fileUpdate(e /*: LocalFileUpdated */) {
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

  log.debug('change = FileUpdate', {
    path: change.path,
    ino: change.ino,
    wip: change.wip
  })

  return [change, undefined]
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

  log.debug(`unlink + add = FileMove${fileMove.update ? '(update)' : ''}`, {
    oldpath: fileMove.old && fileMove.old.path,
    path: fileMove.path,
    ino: fileMove.ino,
    wip: fileMove.wip
  })

  return [fileMove, unlinkChange]
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

  log.debug(`unlinkDir + addDir  = DirMove`, {
    oldpath: dirMove.old && dirMove.old.path,
    path: dirMove.path,
    ino: dirMove.ino,
    wip: dirMove.wip
  })

  return [dirMove, unlinkChange]
}

function fileMoveFromAddUnlink(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUnlinked */
) {
  const addChange /*: ?LocalFileAddition */ = maybeAddFile(sameInodeChange)
  if (!addChange) return

  const fileMove /*: Object */ = build('FileMove', addChange.path, {
    stats: addChange.stats,
    md5sum: addChange.md5sum,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })

  log.debug(`add  + unlink = FileMove`, {
    oldpath: fileMove.old && fileMove.old.path,
    path: fileMove.path,
    ino: fileMove.ino,
    wip: fileMove.wip
  })

  return [fileMove, addChange]
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
    'unlink(src) + change(dst -> newDst) = FileMove.overwrite(src, newDst)',
    {
      oldpath: fileMove.old && fileMove.old.path,
      path: fileMove.path,
      ino: fileMove.ino,
      wip: fileMove.wip
    }
  )

  return [fileMove, fileDeletion]
}

function dirMoveFromAddUnlink(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirUnlinked */
) {
  const addChange /*: ?LocalDirAddition */ = maybePutFolder(sameInodeChange)
  if (!addChange) return

  const dirMove /*: Object */ = build('DirMove', addChange.path, {
    stats: addChange.stats,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })

  log.debug('addDir + unlinkDir = DirMove', {
    oldpath: dirMove.old && dirMove.old.path,
    path: dirMove.path,
    ino: dirMove.ino,
    wip: dirMove.wip
  })

  return [dirMove, addChange]
}

function fileMoveIdentical(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUpdated */
) {
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

  log.debug('add + change = FileMove (same id)', {
    oldpath: fileMove.old && fileMove.old.path,
    path: fileMove.path,
    ino: fileMove.ino,
    wip: fileMove.wip
  })

  return [fileMove, addChange]
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

  log.debug('add + add = FileMove (same id)', {
    oldpath: fileMove.old && fileMove.old.path,
    path: fileMove.path,
    ino: fileMove.ino,
    wip: fileMove.wip
  })

  return [fileMove, addChange]
}

function fileMoveIdenticalOffline(dstEvent /*: LocalFileAdded */) {
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

  log.debug('add = FileMove (same id, offline)', {
    oldpath: fileMove.old.path,
    path: fileMove.path,
    ino: fileMove.ino,
    wip: fileMove.wip
  })

  return [fileMove, undefined]
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

  log.debug('addDir + addDir = DirMove (same id)', {
    oldpath: dirMove.old && dirMove.old.path,
    path: dirMove.path,
    ino: dirMove.ino,
    wip: dirMove.wip
  })

  return [dirMove, addChange]
}

function dirMoveIdenticalOffline(dstEvent /*: LocalDirAdded */) {
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

  log.debug('addDir = DirMove (same id, offline)', {
    oldpath: dirMove.old.path,
    path: dirMove.path,
    ino: dirMove.ino,
    wip: dirMove.wip
  })

  return [dirMove, undefined]
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

  const fileMove /*: Object */ = build('FileMove', e.path, {
    stats: e.stats,
    old: moveChange.old,
    ino: e.stats.ino,
    md5sum: e.md5sum
  })
  if (!e.md5sum) fileMove.wip = true

  log.debug('FileMove + add = FileMove', {
    oldpath: fileMove.old && fileMove.old.path,
    path: fileMove.path,
    ino: fileMove.ino,
    wip: fileMove.wip
  })

  return [fileMove, moveChange]
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
    const dirMove /*: Object */ = build('DirMove', moveChange.path, {
      stats: e.stats,
      old: moveChange.old,
      ino: e.stats.ino,
      overwrite: true
    })

    log.debug(
      'DirMove(a, b) + addDir(b) = DirMove.overwrite(a, b) [chokidar bug]',
      {
        oldpath: dirMove.old && dirMove.old.path,
        path: dirMove.path,
        ino: dirMove.ino
      }
    )

    return [dirMove, moveChange]
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
    const ignored = build('Ignored', moveChange.path)

    log.debug(
      `DirMove(a, b) + addDir(a) = Ignored(b, a) (identical renaming loopback)`,
      {
        oldpath: moveChange.old && moveChange.old.path,
        path: moveChange.path,
        ino: moveChange.ino
      }
    )

    return [ignored, moveChange]
  }
}

function includeAddDirEventInDirMove(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalDirAdded */
) {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(sameInodeChange)
  if (!moveChange) return

  const dirMove /*: Object */ = build('DirMove', e.path, {
    stats: e.stats,
    old: moveChange.old,
    ino: e.stats.ino
  })
  if (e.wip) dirMove.wip = true

  log.debug('DirMove + addDir = DirMove', {
    oldpath: dirMove.old && dirMove.old.path,
    path: dirMove.path,
    ino: dirMove.ino,
    wip: dirMove.wip
  })
  return [dirMove, moveChange]
}

function includeChangeEventIntoFileMove(
  sameInodeChange /*: ?LocalChange */,
  e /*: LocalFileUpdated */
) {
  const moveChange /*: ?LocalFileMove */ = maybeMoveFile(sameInodeChange)
  if (!moveChange) return

  const fileMove /*: Object */ = build('FileMove', moveChange.path, {
    stats: e.stats,
    old: moveChange.old,
    ino: e.stats.ino,
    md5sum: e.md5sum,
    update: _.defaults(
      {
        // In almost all cases, change event has the destination path. But on
        // macOS identical renaming, it has the source path. So we make sure
        // the file change being merged after the move won't erase the
        // destination path with the source one. Should be a no-op on all other
        // cases anyway, since e.path should already be the same as
        // moveChange.path
        path: moveChange.path
      },
      e
    )
  })

  log.debug('FileMove + change', {
    oldPath: fileMove.old && fileMove.old.path,
    path: fileMove.path,
    ino: fileMove.ino
  })

  return [fileMove, moveChange]
}

function convertFileMoveToDeletion(samePathChange /*: ?LocalChange */) {
  const moveChange /*: ?LocalFileMove */ = maybeMoveFile(samePathChange)
  if (moveChange && moveChange.wip && moveChange.old) {
    const fileDeletion /*: Object */ = build(
      'FileDeletion',
      moveChange.old.path,
      {
        old: moveChange.old,
        ino: moveChange.ino
      }
    )

    log.debug('FileMove + unlink = FileDeletion', {
      path: fileDeletion.path,
      ino: fileDeletion.ino
    })

    return [fileDeletion, moveChange]
  }
}

function convertDirMoveToDeletion(samePathChange /*: ?LocalChange */) {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(samePathChange)
  if (moveChange && moveChange.old) {
    const dirDeletion /*: Object */ = build(
      'DirDeletion',
      moveChange.old.path,
      {
        old: moveChange.old,
        ino: moveChange.ino
      }
    )

    log.debug('DirMove + unlinkDir = DirDeletion', {
      path: dirDeletion.path,
      ino: dirDeletion.ino
    })

    return [dirDeletion, moveChange]
  }
}

function ignoreDirAdditionThenDeletion(samePathChange /*: ?LocalChange */) {
  const addChange /*: ?LocalDirAddition */ = maybePutFolder(samePathChange)
  if (addChange && addChange.wip) {
    const ignored = build('Ignored', addChange.path)

    log.debug('Folder was added then deleted. Ignoring add.', {
      path: addChange.path,
      ino: addChange.ino
    })

    return [ignored, addChange]
  }
}

function ignoreFileAdditionThenDeletion(samePathChange /*: ?LocalChange */) {
  const addChange /*: ?LocalFileAddition */ = maybeAddFile(samePathChange)
  if (addChange && addChange.wip) {
    const ignored = build('Ignored', addChange.path)

    log.debug('File was added then deleted. Ignoring add.', {
      path: addChange.path,
      ino: addChange.ino
    })

    return [ignored, addChange]
  }
}

function ignoreUnmergedDirMoveThenDeletion(samePathChange /*: ?LocalChange */) {
  const moveChange /*: ?LocalDirMove */ = maybeMoveFolder(samePathChange)
  if (moveChange && !moveChange.old) {
    const ignored = build('Ignored', moveChange.path)

    log.debug('Folder was added then moved then deleted. Ignoring.', {
      path: moveChange.path,
      ino: moveChange.ino
    })

    return [ignored, moveChange]
  }
}

function ignoreUnmergedFileMoveThenDeletion(
  samePathChange /*: ?LocalChange */
) {
  const moveChange /*: ?LocalFileMove */ = maybeMoveFile(samePathChange)
  if (moveChange && !moveChange.old) {
    const ignored = build('Ignored', moveChange.path)

    log.debug('File was added then moved then deleted. Ignoring.', {
      path: moveChange.path,
      ino: moveChange.ino
    })

    return [ignored, moveChange]
  }
}
