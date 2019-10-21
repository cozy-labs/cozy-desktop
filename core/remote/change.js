/** A remote change to be send to Prep/Merge.
 *
 * @module core/remote/change
 * @flow
 */

/*::
import type { RemoteDoc, RemoteDeletion } from './document'
import type { Metadata } from '../metadata'
*/

const path = require('path')

const metadata = require('../metadata')

/*::
export type RemoteFileAddition = {
  sideName: 'remote',
  type: 'FileAddition',
  doc: Metadata
}
export type RemoteFileDeletion = {
  sideName: 'remote',
  type: 'FileDeletion',
  doc: Metadata
}
export type RemoteFileMove = {
  sideName: 'remote',
  type: 'FileMove',
  doc: Metadata,
  was: Metadata,
  needRefetch?: true,
  update?: boolean
}
export type RemoteFileRestoration = {
  sideName: 'remote',
  type: 'FileRestoration',
  doc: Metadata,
  was: Metadata
}
export type RemoteFileTrashing = {
  sideName: 'remote',
  type: 'FileTrashing',
  doc: Metadata,
  was: Metadata
}
export type RemoteFileUpdate = {
  sideName: 'remote',
  type: 'FileUpdate',
  doc: Metadata
}
export type RemoteDirAddition = {
  sideName: 'remote',
  type: 'DirAddition',
  doc: Metadata
}
export type RemoteDirDeletion = {
  sideName: 'remote',
  type: 'DirDeletion',
  doc: Metadata
}
export type RemoteDirMove = {
  sideName: 'remote',
  type: 'DirMove',
  doc: Metadata,
  was: Metadata,
  needRefetch?: true,
  descendantMoves?: RemoteDescendantChange[]
}
export type RemoteDirRestoration = {
  sideName: 'remote',
  type: 'DirRestoration',
  doc: Metadata,
  was: Metadata
}
export type RemoteDirTrashing = {
  sideName: 'remote',
  type: 'DirTrashing',
  doc: Metadata,
  was: Metadata
}
export type RemoteIgnoredChange = {
  sideName: 'remote',
  type: 'IgnoredChange',
  doc: Metadata|RemoteDoc|RemoteDeletion,
  was?: Metadata,
  detail: string
}
export type RemoteInvalidChange = {
  sideName: 'remote',
  type: 'InvalidChange',
  doc: *,
  was?: Metadata,
  error: Error
}
export type RemoteUpToDate = {
  sideName: 'remote',
  type: 'UpToDate',
  doc: Metadata,
  was: Metadata
}
export type RemoteDescendantChange = {
  sideName: 'remote',
  type: 'DescendantChange',
  doc: Metadata,
  was: Metadata,
  ancestorPath: string,
  descendantMoves?: RemoteDescendantChange[],
  update?: boolean
}

export type RemoteChange =
  | RemoteDirAddition
  | RemoteDirDeletion
  | RemoteDirMove
  | RemoteDirRestoration
  | RemoteDirTrashing
  | RemoteFileAddition
  | RemoteFileDeletion
  | RemoteFileMove
  | RemoteFileRestoration
  | RemoteFileTrashing
  | RemoteFileUpdate
  | RemoteIgnoredChange
  | RemoteDescendantChange
  | RemoteInvalidChange
  | RemoteUpToDate
*/

module.exports = {
  added,
  trashed,
  deleted,
  restored,
  upToDate,
  updated,
  isChildSource,
  isChildDestination,
  isChildMove,
  isOnlyChildMove,
  applyMoveToPath,
  includeDescendant,
  applyMoveInsideMove,
  sort
}

const sideName = 'remote'

// FIXME: return types
function added(
  doc /*: Metadata */
) /*: RemoteFileAddition | RemoteDirAddition */ {
  if (metadata.isFile(doc)) {
    return {
      sideName,
      type: 'FileAddition',
      doc
    }
  } else {
    return {
      sideName,
      type: 'DirAddition',
      doc
    }
  }
}

function trashed(
  doc /*: Metadata */,
  was /*: Metadata */
) /*: RemoteFileTrashing | RemoteDirTrashing */ {
  if (metadata.isFile(doc)) {
    return {
      sideName,
      type: 'FileTrashing',
      doc,
      was
    }
  } else {
    return {
      sideName,
      type: 'DirTrashing',
      doc,
      was
    }
  }
}

function deleted(
  doc /*: Metadata */
) /*: RemoteFileDeletion | RemoteDirDeletion */ {
  if (metadata.isFile(doc)) {
    return {
      sideName,
      type: 'FileDeletion',
      doc
    }
  } else {
    return {
      sideName,
      type: 'DirDeletion',
      doc
    }
  }
}

function restored(
  doc /*: Metadata */,
  was /*: Metadata */
) /*: RemoteFileRestoration | RemoteDirRestoration */ {
  if (metadata.isFile(doc)) {
    return {
      sideName,
      type: 'FileRestoration',
      doc,
      was
    }
  } else {
    return {
      sideName,
      type: 'DirRestoration',
      doc,
      was
    }
  }
}

function upToDate(
  doc /*: Metadata */,
  was /*: Metadata */
) /*: RemoteUpToDate */ {
  return { sideName, type: 'UpToDate', doc, was }
}

function updated(
  doc /*: Metadata */
) /*: RemoteFileUpdate | RemoteDirAddition */ {
  if (metadata.isFile(doc)) {
    return {
      sideName,
      type: 'FileUpdate',
      doc
    }
  } else {
    return {
      sideName,
      type: 'DirAddition',
      doc
    }
  }
}

function isChildMove(
  p /*: RemoteChange */,
  c /*: RemoteChange */
) /*: boolean %checks */ {
  return (
    isFolderMove(p) &&
    (c.type === 'DirMove' || c.type === 'FileMove') &&
    (isChildDestination(p, c) || isChildSource(p, c))
  )
}

function isChildDestination(
  p /*: RemoteChange */,
  c /*: RemoteChange */
) /*: boolean %checks */ {
  return isFolderMove(p) && isMove(c) && path.dirname(c.doc.path) === p.doc.path
}

function isChildSource(
  p /*: RemoteChange */,
  c /*: RemoteChange */
) /*: boolean %checks */ {
  return (
    isFolderMove(p) &&
    isMove(c) &&
    p.was &&
    c.was &&
    path.dirname(c.was.path) === p.was.path
  )
}

/**
 *          was          doc
 *     p    /p     ->    /p2
 *     c    /p/c   ->    /p2/c
 */
function isOnlyChildMove(
  p /*: RemoteChange */,
  c /*: RemoteChange */
) /*: boolean %checks */ {
  return (
    isChildSource(p, c) &&
    isChildDestination(p, c) &&
    path.basename(c.doc.path) === path.basename(c.was.path)
  )
}

function applyMoveToPath(
  a /*: RemoteDirMove|RemoteDescendantChange */,
  p /*: string */
) /*: string */ {
  return p.replace(a.was.path, a.doc.path)
}

function applyMoveInsideMove(
  parentMove /*: RemoteDirMove|RemoteDescendantChange */,
  childMove /*: RemoteDirMove | RemoteFileMove */
) {
  childMove.was.path = applyMoveToPath(parentMove, childMove.was.path)
  childMove.needRefetch = true
}

const isDelete = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirDeletion' || a.type === 'FileDeletion'
const isAdd = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirAddition' || a.type === 'FileAddition'
const isMove = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirMove' || a.type === 'FileMove' || a.type === 'DescendantChange'
const isFolderMove = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirMove' || a.type === 'DescendantChange'
const isTrash = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirTrashing' || a.type === 'FileTrashing'
const isRestore = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirRestoration' || a.type === 'FileRestoration'
const isIgnore = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'IgnoredChange'

function includeDescendant(
  parent /*: RemoteDirMove|RemoteDescendantChange */,
  e /*: RemoteDescendantChange */
) {
  parent.descendantMoves = parent.descendantMoves || []
  parent.descendantMoves.push(e, ...(e.descendantMoves || []))
  delete e.descendantMoves
}

const createdPath = (a /*: RemoteChange */) /*: ?string */ =>
  isAdd(a) || isMove(a) || isRestore(a) ? a.doc.path : null
const createdId = (a /*: RemoteChange */) /*: ?string */ =>
  isAdd(a) || isMove(a) || isRestore(a) ? metadata.id(a.doc.path) : null
const deletedPath = (a /*: RemoteChange */) /*: ?string */ =>
  isDelete(a) ? a.doc.path : isMove(a) || isTrash(a) ? a.was.path : null
const deletedId = (a /*: RemoteChange */) /*: ?string */ =>
  isDelete(a)
    ? metadata.id(a.doc.path)
    : isMove(a) || isTrash(a)
    ? metadata.id(a.was.path)
    : null
const ignoredPath = (a /*: RemoteChange */) /*: ?string */ =>
  isIgnore(a) && typeof a.doc.path === 'string' ? a.doc.path : null
const areParentChild = (p /*: ?string */, c /*: ?string */) /*: boolean */ =>
  !!p && !!c && c.startsWith(p + path.sep)
const lower = (p1 /*: ?string */, p2 /*: ?string */) /*: boolean */ =>
  !!p1 && !!p2 && p1 < p2

const aFirst = -1
const bFirst = 1

const sorter = (a, b) => {
  // if there is one ignored change, it is put back to the end
  if (ignoredPath(a) && !ignoredPath(b)) return bFirst
  if (ignoredPath(b) && !ignoredPath(a)) return aFirst
  if (lower(ignoredPath(a), ignoredPath(b))) return aFirst
  if (lower(ignoredPath(b), ignoredPath(a))) return bFirst

  // if one action is the parent of another, it takes priority
  if (areParentChild(createdPath(a), createdPath(b))) return aFirst
  if (areParentChild(createdPath(b), createdPath(a))) return bFirst
  if (areParentChild(deletedPath(b), deletedPath(a))) return aFirst
  if (areParentChild(deletedPath(a), deletedPath(b))) return bFirst
  if (areParentChild(createdPath(a), deletedPath(b))) return aFirst
  if (areParentChild(createdPath(b), deletedPath(a))) return bFirst
  if (areParentChild(deletedPath(a), createdPath(b))) return bFirst
  if (areParentChild(deletedPath(b), createdPath(a))) return aFirst

  if (deletedId(a) && createdId(b) && deletedId(a) === createdId(b))
    return aFirst
  if (deletedId(b) && createdId(a) && deletedId(b) === createdId(a))
    return bFirst
  if (deletedPath(a) && createdPath(b) && deletedPath(a) === createdPath(b))
    return aFirst
  if (deletedPath(b) && createdPath(a) && deletedPath(b) === createdPath(a))
    return bFirst

  // otherwise, order by add path
  if (lower(createdPath(a), createdPath(b))) return aFirst
  if (lower(createdPath(b), createdPath(a))) return bFirst

  // if there isnt 2 add paths, sort by del path
  if (lower(deletedPath(b), deletedPath(a))) return aFirst
  return bFirst
}

function sort(changes /*: Array<RemoteChange> */) /*: Array<RemoteChange> */ {
  return changes.sort(sorter)
}
