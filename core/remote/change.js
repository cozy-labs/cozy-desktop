/* @flow */

import path from 'path'

import { isFile } from '../metadata'

import type { RemoteDoc, RemoteDeletion } from './document'
import type { Metadata } from '../metadata'

// TODO: Introduce UnidentifiedChange type with doc/was properties?
// TODO: Merge with local/prep_action?
export type FileAdded = {type: 'FileAdded', doc: Metadata}
export type FileDeleted = {type: 'FileDeleted', doc: Metadata}
export type FileDissociated = {type: 'FileDissociated', doc: Metadata, was: Metadata}
export type FileMoved = {type: 'FileMoved', doc: Metadata, was: Metadata, needRefetch?: true}
export type FileRestored = {type: 'FileRestored', doc: Metadata, was: Metadata}
export type FileTrashed = {type: 'FileTrashed', doc: Metadata, was: Metadata}
export type FileUpdated = {type: 'FileUpdated', doc: Metadata}

export type FolderAdded = {type: 'FolderAdded', doc: Metadata, was: Metadata}
export type FolderDeleted = {type: 'FolderDeleted', doc: Metadata}
export type FolderDissociated = {type: 'FolderDissociated', doc: Metadata, was: Metadata}
export type FolderMoved = {type: 'FolderMoved', doc: Metadata, was: Metadata, needRefetch?: true}
export type FolderRestored = {type: 'FolderRestored', doc: Metadata, was: Metadata}
export type FolderTrashed = {type: 'FolderTrashed', doc: Metadata, was: Metadata}

export type IgnoredChange = {type: 'IgnoredChange', doc: Metadata|RemoteDoc|RemoteDeletion, detail: string}
export type InvalidChange = {type: 'InvalidChange', doc: *, error: Error}
// FIXME: use PlatformIncompatibility type
export type PlatformIncompatibleChange = {type: 'PlatformIncompatibleChange', doc: Metadata, incompatibilities: *}
export type UpToDate = {type: 'UpToDate', doc: Metadata, was: Metadata}

export type Change =
  | FileAdded
  | FileDeleted
  | FileDissociated
  | FileMoved
  | FileRestored
  | FileTrashed
  | FileUpdated
  | FolderAdded
  | FolderDeleted
  | FolderDissociated
  | FolderMoved
  | FolderRestored
  | FolderTrashed
  | IgnoredChange
  | InvalidChange
  | PlatformIncompatibleChange
  | UpToDate

// FIXME: return types
export const added = (doc: Metadata): * =>
  ({type: (isFile(doc) ? 'FileAdded' : 'FolderAdded'), doc})

export const trashed = (doc: Metadata, was: Metadata): * =>
  ({type: (isFile(doc) ? 'FileTrashed' : 'FolderTrashed'), doc, was})

export const deleted = (doc: Metadata): * =>
  ({type: (isFile(doc) ? 'FileDeleted' : 'FolderDeleted'), doc})

export const restored = (doc: Metadata, was: Metadata): * =>
  ({type: (isFile(doc) ? 'FileRestored' : 'FolderRestored'), doc, was})

export const upToDate = (doc: Metadata, was: Metadata): * =>
  ({type: 'UpToDate', doc, was})

export const updated = (doc: Metadata): * =>
  ({type: (isFile(doc) ? 'FileUpdated' : 'FolderAdded'), doc})

export const dissociated = (doc: Metadata, was: Metadata): * =>
  ({type: (isFile(doc) ? 'FileDissociated' : 'FolderDissociated'), doc, was})

// TODO: Rename args
export const isChildMove = (a: Change, b: Change): boolean %checks => {
  return a.type === 'FolderMoved' &&
        (b.type === 'FolderMoved' || b.type === 'FileMoved') &&
        (b.doc.path.indexOf(a.doc.path + path.sep) === 0) &&
        a.was && b.was &&
        (b.was.path.indexOf(a.was.path + path.sep) === 0) &&
        a.type === 'FolderMoved' &&
        (b.type === 'FolderMoved' || b.type === 'FileMoved')
}

/*     was           doc
 a    /a     ->    /a2
 b    /a/b   ->    /a2/b
*/
export const isOnlyChildMove = (a: FolderMoved, b: FileMoved|FolderMoved): boolean %checks => {
  return isChildMove(a, b) && b.doc.path.replace(a.doc.path, '') === b.was.path.replace(a.was.path, '')
}

export const applyMoveToPath = (a: FolderMoved, p: string): string => {
  return p.replace(a.was.path, a.doc.path)
}

const isDelete = (a: Change): boolean %checks => a.type === 'FolderDeleted' || a.type === 'FileDeleted'
const isAdd = (a: Change): boolean %checks => a.type === 'FolderAdded' || a.type === 'FileAdded'
const isMove = (a: Change): boolean %checks => a.type === 'FolderMoved' || a.type === 'FileMoved'
const isTrash = (a: Change): boolean %checks => a.type === 'FolderTrashed' || a.type === 'FileTrashed'
const isRestore = (a: Change): boolean %checks => a.type === 'FolderRestored' || a.type === 'FileRestored'
const isDissociate = (a: Change): boolean %checks => a.type === 'FolderDissociated' || a.type === 'FileDissociated'

const addPath = (a: Change): ?string => isAdd(a) || isMove(a) || isRestore(a) || isDissociate(a) ? a.doc.path : null
const delPath = (a: Change): ?string => isDelete(a) ? a.doc.path : isMove(a) || isTrash(a) ? a.was.path : null
const childOf = (p1: ?string, p2: ?string): boolean => p1 != null && p2 != null && p2 !== p1 && p2.startsWith(p1 + path.sep)
const lower = (p1: ?string, p2: ?string): boolean => p1 != null && p2 != null && p2 !== p1 && p1 < p2

const isChildDelete = (a: Change, b: Change) => childOf(delPath(a), delPath(b))
const isChildAdd = (a: Change, b: Change) => childOf(addPath(a), addPath(b))

const sorter = (a, b) => {
  if (childOf(addPath(a), delPath(b))) return -1
  if (childOf(addPath(b), delPath(a))) return 1

  // if one action is a child of another, it takes priority
  if (isChildAdd(a, b)) return -1
  if (isChildDelete(b, a)) return -1
  if (isChildAdd(b, a)) return 1
  if (isChildDelete(a, b)) return 1

  // otherwise, order by add path
  if (lower(addPath(a), addPath(b))) return -1
  if (lower(addPath(b), addPath(a))) return 1

  // if there isnt 2 add paths, sort by del path
  if (lower(delPath(b), delPath(a))) return -1

  return 1
}

export const sort = (changes: Change[]): void => {
  changes.sort(sorter)
}
