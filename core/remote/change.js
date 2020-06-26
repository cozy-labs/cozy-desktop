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
  return (
    isFolderMove(p) &&
    isMove(c) &&
    metadata.samePath(path.dirname(c.doc.path), p.doc.path)
  )
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
    metadata.samePath(path.dirname(c.was.path), p.was.path)
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
    metadata.samePath(path.basename(c.doc.path), path.basename(c.was.path))
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
const isDescendant = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DescendantChange'
const isMove = (a /*: RemoteChange */) /*: boolean %checks */ =>
  isFileMove(a) || isFolderMove(a)
const isFileMove = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'FileMove' || (isDescendant(a) && a.doc.docType === 'File')
const isFolderMove = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirMove' || (isDescendant(a) && a.doc.docType === 'Folder')
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
  isAdd(a) || isMove(a) || isDescendant(a) || isRestore(a) ? a.doc.path : null
const createdId = (a /*: RemoteChange */) /*: ?string */ =>
  isAdd(a) || isMove(a) || isDescendant(a) || isRestore(a)
    ? metadata.id(a.doc.path)
    : null
const deletedPath = (a /*: RemoteChange */) /*: ?string */ =>
  isDelete(a)
    ? a.doc.path
    : isMove(a) || isDescendant(a) || isTrash(a)
    ? a.was.path
    : null
const deletedId = (a /*: RemoteChange */) /*: ?string */ =>
  isDelete(a)
    ? metadata.id(a.doc.path)
    : isMove(a) || isDescendant(a) || isTrash(a)
    ? metadata.id(a.was.path)
    : null
const ignoredPath = (a /*: RemoteChange */) /*: ?string */ =>
  isIgnore(a) && typeof a.doc.path === 'string' ? a.doc.path : null
const areParentChild = (p /*: ?string */, c /*: ?string */) /*: boolean */ =>
  !!p && !!c && metadata.areParentChildPaths(p, c)
const areEqual = (a /*: ?string */, b /*: ?string */) /*: boolean */ =>
  !!a && !!b && a === b
const lower = (p1 /*: ?string */, p2 /*: ?string */) /*: boolean */ =>
  !!p1 && !!p2 && p1 < p2

const aFirst = -1
const bFirst = 1

const sortForDelete = (del, b, delFirst) => {
  if (isDelete(b) || isTrash(b)) {
    if (lower(deletedPath(del), deletedPath(b))) return delFirst
    if (lower(deletedPath(b), deletedPath(del))) return -delFirst

    return 0
  }

  return delFirst
}

const sortForDescendant = (desc, b, descFirst) => {
  if (areParentChild(deletedPath(desc), createdPath(b))) return descFirst
  if (areParentChild(deletedPath(b), createdPath(desc))) return -descFirst

  if (areParentChild(createdPath(b), deletedPath(desc))) return descFirst
  if (areParentChild(createdPath(desc), deletedPath(b))) return -descFirst

  if (areEqual(deletedId(desc), createdId(b))) return descFirst
  if (areEqual(deletedId(b), createdId(desc))) return descFirst

  return -descFirst
}

const sortForMove = (move, b, moveFirst) => {
  if (isMove(b) || isDescendant(b)) {
    if (isDescendant(move) && isDescendant(b)) {
      if (areParentChild(deletedPath(move), deletedPath(b))) return moveFirst
      if (areParentChild(deletedPath(b), deletedPath(move))) return -moveFirst

      if (areEqual(deletedId(move), createdId(b))) return moveFirst
      if (areEqual(deletedId(b), createdId(move))) return -moveFirst

      if (lower(deletedPath(move), deletedPath(b))) return moveFirst
      if (lower(deletedPath(b), deletedPath(move))) return -moveFirst

      return 0
    }
    if (isDescendant(move) && !isDescendant(b))
      return sortForDescendant(move, b, moveFirst)
    if (!isDescendant(move) && isDescendant(b))
      return sortForDescendant(b, move, -moveFirst)

    if (areParentChild(deletedPath(b), deletedPath(move))) return moveFirst
    if (areParentChild(deletedPath(move), deletedPath(b))) return -moveFirst

    if (areParentChild(deletedPath(b), createdPath(move))) return moveFirst
    if (areParentChild(deletedPath(move), createdPath(b))) return -moveFirst

    if (areParentChild(createdPath(move), createdPath(b))) return moveFirst
    if (areParentChild(createdPath(b), createdPath(move))) return -moveFirst

    if (areParentChild(createdPath(move), deletedPath(b))) return moveFirst
    if (areParentChild(createdPath(b), deletedPath(move))) return -moveFirst

    // Both orders would be "valid" but if there already is a document at this
    // path, processing `created` first would lead to a conflict.
    // On the other hand, if there aren't any documents at this path,
    // processing `deleted` first will lead to an error that can be recovered
    // from via a retry.
    //
    // We use the `*Id` methods here since multiple paths can replace the same
    // path on macOS and Windows.
    if (areEqual(deletedId(move), createdId(b))) return moveFirst
    if (areEqual(deletedId(b), createdId(move))) return -moveFirst

    if (lower(createdPath(move), createdPath(b))) return moveFirst
    if (lower(createdPath(b), createdPath(move))) return -moveFirst

    return 0
  }

  return moveFirst
}

const sortForAdd = (add, b, addFirst) => {
  if (isRestore(b) || isAdd(b)) {
    if (areParentChild(createdPath(add), createdPath(b))) return addFirst
    if (areParentChild(createdPath(b), createdPath(add))) return -addFirst

    if (lower(createdPath(add), createdPath(b))) return addFirst
    if (lower(createdPath(b), createdPath(add))) return -addFirst

    return 0
  }

  return addFirst
}

// Priorities:
// isDelete > isTrash > isMove > isDescendant > isRestore > isAdd > isIgnore
const sortChanges = (a, b) => {
  if (isDelete(a) || isTrash(a)) return sortForDelete(a, b, aFirst)
  if (isDelete(b) || isTrash(b)) return sortForDelete(b, a, bFirst)

  if (isMove(a) || isDescendant(a)) return sortForMove(a, b, aFirst)
  if (isMove(b) || isDescendant(b)) return sortForMove(b, a, bFirst)

  if (isRestore(a) || isAdd(a)) return sortForAdd(a, b, aFirst)
  if (isRestore(b) || isAdd(b)) return sortForAdd(b, a, bFirst)

  if (lower(ignoredPath(a), ignoredPath(b))) return aFirst
  if (lower(ignoredPath(b), ignoredPath(a))) return bFirst

  return 0
}

function sort(changes /*: Array<RemoteChange> */) /*: Array<RemoteChange> */ {
  // return changes.sort(sortByPath).sort(sortByAction)
  return changes.sort(sortChanges)
}
