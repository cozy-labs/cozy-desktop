/* @flow */

import path from 'path'

import { isFile } from '../metadata'

import type { RemoteDoc, RemoteDeletion } from './document'
import type { Metadata } from '../metadata'

// TODO: Introduce UnidentifiedChange type with doc/was properties?
// TODO: Merge with local/prep_action?
export type RemoteFileAdded = {type: 'RemoteFileAdded', doc: Metadata}
export type RemoteFileDeleted = {type: 'RemoteFileDeleted', doc: Metadata}
export type RemoteFileDissociated = {type: 'RemoteFileDissociated', doc: Metadata, was: Metadata}
export type RemoteFileMoved = {type: 'RemoteFileMoved', doc: Metadata, was: Metadata, needRefetch?: true}
export type RemoteFileRestored = {type: 'RemoteFileRestored', doc: Metadata, was: Metadata}
export type RemoteFileTrashed = {type: 'RemoteFileTrashed', doc: Metadata, was: Metadata}
export type RemoteFileUpdated = {type: 'RemoteFileUpdated', doc: Metadata}

export type RemoteFolderAdded = {type: 'RemoteFolderAdded', doc: Metadata, was: Metadata}
export type RemoteFolderDeleted = {type: 'RemoteFolderDeleted', doc: Metadata}
export type RemoteFolderDissociated = {type: 'RemoteFolderDissociated', doc: Metadata, was: Metadata}
export type RemoteFolderMoved = {type: 'RemoteFolderMoved', doc: Metadata, was: Metadata, needRefetch?: true}
export type RemoteFolderRestored = {type: 'RemoteFolderRestored', doc: Metadata, was: Metadata}
export type RemoteFolderTrashed = {type: 'RemoteFolderTrashed', doc: Metadata, was: Metadata}

export type RemoteIgnoredChange = {type: 'RemoteIgnoredChange', doc: Metadata|RemoteDoc|RemoteDeletion, detail: string}
export type RemoteInvalidChange = {type: 'RemoteInvalidChange', doc: *, error: Error}
export type RemoteUpToDate = {type: 'RemoteUpToDate', doc: Metadata, was: Metadata}

export type RemoteChange =
  | RemoteFileAdded
  | RemoteFileDeleted
  | RemoteFileDissociated
  | RemoteFileMoved
  | RemoteFileRestored
  | RemoteFileTrashed
  | RemoteFileUpdated
  | RemoteFolderAdded
  | RemoteFolderDeleted
  | RemoteFolderDissociated
  | RemoteFolderMoved
  | RemoteFolderRestored
  | RemoteFolderTrashed
  | RemoteIgnoredChange
  | RemoteInvalidChange
  | RemoteUpToDate

// FIXME: return types
export const added = (doc: Metadata): * =>
  ({type: (isFile(doc) ? 'RemoteFileAdded' : 'RemoteFolderAdded'), doc})

export const trashed = (doc: Metadata, was: Metadata): * =>
  ({type: (isFile(doc) ? 'RemoteFileTrashed' : 'RemoteFolderTrashed'), doc, was})

export const deleted = (doc: Metadata): * =>
  ({type: (isFile(doc) ? 'RemoteFileDeleted' : 'RemoteFolderDeleted'), doc})

export const restored = (doc: Metadata, was: Metadata): * =>
  ({type: (isFile(doc) ? 'RemoteFileRestored' : 'RemoteFolderRestored'), doc, was})

export const upToDate = (doc: Metadata, was: Metadata): * =>
  ({type: 'RemoteUpToDate', doc, was})

export const updated = (doc: Metadata): * =>
  ({type: (isFile(doc) ? 'RemoteFileUpdated' : 'RemoteFolderAdded'), doc})

export const dissociated = (doc: Metadata, was: Metadata): * =>
  ({type: (isFile(doc) ? 'RemoteFileDissociated' : 'RemoteFolderDissociated'), doc, was})

// TODO: Rename args
export const isChildMove = (a: RemoteChange, b: RemoteChange): boolean %checks => {
  return a.type === 'RemoteFolderMoved' &&
        (b.type === 'RemoteFolderMoved' || b.type === 'RemoteFileMoved') &&
        (b.doc.path.indexOf(a.doc.path + path.sep) === 0) &&
        a.was && b.was &&
        (b.was.path.indexOf(a.was.path + path.sep) === 0) &&
        a.type === 'RemoteFolderMoved' &&
        (b.type === 'RemoteFolderMoved' || b.type === 'RemoteFileMoved')
}

/*     was           doc
 a    /a     ->    /a2
 b    /a/b   ->    /a2/b
*/
export const isOnlyChildMove = (a: RemoteFolderMoved, b: RemoteFileMoved|RemoteFolderMoved): boolean %checks => {
  return isChildMove(a, b) && b.doc.path.replace(a.doc.path, '') === b.was.path.replace(a.was.path, '')
}

export const applyMoveToPath = (a: RemoteFolderMoved, p: string): string => {
  return p.replace(a.was.path, a.doc.path)
}

const isDelete = (a: RemoteChange): boolean %checks => a.type === 'RemoteFolderDeleted' || a.type === 'RemoteFileDeleted'
const isAdd = (a: RemoteChange): boolean %checks => a.type === 'RemoteFolderAdded' || a.type === 'RemoteFileAdded'
const isMove = (a: RemoteChange): boolean %checks => a.type === 'RemoteFolderMoved' || a.type === 'RemoteFileMoved'
const isTrash = (a: RemoteChange): boolean %checks => a.type === 'RemoteFolderTrashed' || a.type === 'RemoteFileTrashed'
const isRestore = (a: RemoteChange): boolean %checks => a.type === 'RemoteFolderRestored' || a.type === 'RemoteFileRestored'
const isDissociate = (a: RemoteChange): boolean %checks => a.type === 'RemoteFolderDissociated' || a.type === 'RemoteFileDissociated'

const addPath = (a: RemoteChange): ?string => isAdd(a) || isMove(a) || isRestore(a) || isDissociate(a) ? a.doc.path : null
const delPath = (a: RemoteChange): ?string => isDelete(a) ? a.doc.path : isMove(a) || isTrash(a) ? a.was.path : null
const childOf = (p1: ?string, p2: ?string): boolean => p1 != null && p2 != null && p2 !== p1 && p2.startsWith(p1 + path.sep)
const lower = (p1: ?string, p2: ?string): boolean => p1 != null && p2 != null && p2 !== p1 && p1 < p2

const isChildDelete = (a: RemoteChange, b: RemoteChange) => childOf(delPath(a), delPath(b))
const isChildAdd = (a: RemoteChange, b: RemoteChange) => childOf(addPath(a), addPath(b))

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

export const sort = (changes: RemoteChange[]): void => {
  changes.sort(sorter)
}
