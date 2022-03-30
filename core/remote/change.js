/** A remote change to be send to Prep/Merge.
 *
 * @module core/remote/change
 * @flow
 */

/*::
import type { DirMetadata, FileMetadata, Metadata, Saved, SavedMetadata } from '../metadata'
*/

const path = require('path')

const metadata = require('../metadata')

/*::
export type RemoteFileAddition = {
  sideName: 'remote',
  type: 'FileAddition',
  doc: FileMetadata
}
export type RemoteFileDeletion = {
  sideName: 'remote',
  type: 'FileDeletion',
  doc: SavedMetadata
}
export type RemoteFileMove = {
  sideName: 'remote',
  type: 'FileMove',
  doc: FileMetadata,
  was: SavedMetadata,
  needRefetch?: true,
  update?: boolean
}
export type RemoteFileRestoration = {
  sideName: 'remote',
  type: 'FileRestoration',
  doc: FileMetadata,
  was: FileMetadata
}
export type RemoteFileTrashing = {
  sideName: 'remote',
  type: 'FileTrashing',
  doc: FileMetadata,
  was: SavedMetadata
}
export type RemoteFileUpdate = {
  sideName: 'remote',
  type: 'FileUpdate',
  doc: FileMetadata
}
export type RemoteDirAddition = {
  sideName: 'remote',
  type: 'DirAddition',
  doc: DirMetadata
}
export type RemoteDirDeletion = {
  sideName: 'remote',
  type: 'DirDeletion',
  doc: SavedMetadata
}
export type RemoteDirMove = {
  sideName: 'remote',
  type: 'DirMove',
  doc: DirMetadata,
  was: SavedMetadata,
  needRefetch?: true,
  descendantMoves: Array<RemoteDescendantDirMove|RemoteDescendantFileMove>
}
export type RemoteDirRestoration = {
  sideName: 'remote',
  type: 'DirRestoration',
  doc: DirMetadata,
  was: DirMetadata
}
export type RemoteDirTrashing = {
  sideName: 'remote',
  type: 'DirTrashing',
  doc: DirMetadata,
  was: SavedMetadata
}
export type RemoteDirUpdate = {
  sideName: 'remote',
  type: 'DirUpdate',
  doc: DirMetadata
}
export type RemoteIgnoredChange = {
  sideName: 'remote',
  type: 'IgnoredChange',
  doc: *,
  was?: SavedMetadata,
  detail: string
}
export type RemoteInvalidChange = {
  sideName: 'remote',
  type: 'InvalidChange',
  doc: Metadata,
  was?: SavedMetadata,
  error: Error
}
export type RemoteUpToDate = {
  sideName: 'remote',
  type: 'UpToDate',
  doc: Metadata,
  was: SavedMetadata
}
export type RemoteDescendantDirMove = {|
  sideName: 'remote',
  type: 'DescendantDirMove',
  doc: DirMetadata,
  was: Saved<DirMetadata>,
  ancestor: RemoteDirMove|RemoteDescendantDirMove,
  descendantMoves: Array<RemoteDescendantDirMove|RemoteDescendantFileMove>,
|}
export type RemoteDescendantFileMove = {|
  sideName: 'remote',
  type: 'DescendantFileMove',
  doc: FileMetadata,
  was: Saved<FileMetadata>,
  ancestor: RemoteDirMove|RemoteDescendantDirMove,
  update: boolean
|}

export type RemoteChange =
  | RemoteDirAddition
  | RemoteDirDeletion
  | RemoteDirMove
  | RemoteDirRestoration
  | RemoteDirTrashing
  | RemoteDirUpdate
  | RemoteFileAddition
  | RemoteFileDeletion
  | RemoteFileMove
  | RemoteFileRestoration
  | RemoteFileTrashing
  | RemoteFileUpdate
  | RemoteIgnoredChange
  | RemoteDescendantDirMove
  | RemoteDescendantFileMove
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
  includeDescendant,
  applyMoveInsideMove,
  sort,
  sortByPath
}

const sideName = 'remote'

// FIXME: return types
function added(
  doc /*: Metadata */
) /*: RemoteFileAddition | RemoteDirAddition */ {
  if (doc.docType === 'file') {
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
  was /*: SavedMetadata */
) /*: RemoteFileTrashing | RemoteDirTrashing */ {
  if (doc.docType === 'file') {
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
  doc /*: SavedMetadata */
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
  was /*: SavedMetadata */
) /*: RemoteUpToDate */ {
  return { sideName, type: 'UpToDate', doc, was }
}

function updated(
  doc /*: Metadata */
) /*: RemoteFileUpdate | RemoteDirUpdate */ {
  if (doc.docType === 'file') {
    return {
      sideName,
      type: 'FileUpdate',
      doc
    }
  } else {
    return {
      sideName,
      type: 'DirUpdate',
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
    !!p.was &&
    !!c.was &&
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

function applyMoveInsideMove(
  parentMove /*: RemoteDirMove|RemoteDescendantDirMove */,
  childMove /*: RemoteDirMove|RemoteFileMove */
) {
  childMove.needRefetch = true
  childMove.was.path = metadata.newChildPath(
    childMove.was.path,
    parentMove.was.path,
    parentMove.doc.path
  )
}

const isDelete = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirDeletion' || a.type === 'FileDeletion'
const isAdd = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirAddition' || a.type === 'FileAddition'
const isDescendant = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DescendantDirMove' || a.type === 'DescendantFileMove'
const isMove = (a /*: RemoteChange */) /*: boolean %checks */ =>
  isFileMove(a) || isFolderMove(a)
const isFileMove = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'FileMove' || a.type === 'DescendantFileMove'
const isFolderMove = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirMove' || a.type === 'DescendantDirMove'
const isTrash = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirTrashing' || a.type === 'FileTrashing'
const isRestore = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'DirRestoration' || a.type === 'FileRestoration'
const isIgnore = (a /*: RemoteChange */) /*: boolean %checks */ =>
  a.type === 'IgnoredChange'

function includeDescendant(
  parent /*: RemoteDirMove|RemoteDescendantDirMove */,
  e /*: RemoteDescendantDirMove|RemoteDescendantFileMove */
) {
  if (parent.type === 'DescendantDirMove') {
    includeDescendant(parent.ancestor, e)
  } else if (e.type === 'DescendantDirMove') {
    parent.descendantMoves.push(e, ...e.descendantMoves)
    e.descendantMoves = []
  } else {
    parent.descendantMoves.push(e)
  }
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

function sortByPath(
  changes /*: Array<RemoteChange> */
) /*: Array<RemoteChange> */ {
  return changes.sort(
    (
      { doc: aDoc /*: { path: string } */ },
      { doc: bDoc /*: { path: string } */ }
    ) => {
      if (!aDoc.path) return 1
      if (!bDoc.path) return -1

      const aPath = aDoc.path.normalize()
      const bPath = bDoc.path.normalize()

      if (aPath < bPath) return -1
      if (aPath > bPath) return 1
      return 0
    }
  )
}
