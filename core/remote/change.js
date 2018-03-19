/* @flow */

/*::
import type { RemoteDoc, RemoteDeletion } from './document'
import type { Metadata } from '../metadata'
*/

const path = require('path')

const { isFile } = require('../metadata')

/*::
export type RemoteFileAddition = {sideName: 'remote', type: 'FileAddition', doc: Metadata}
export type RemoteFileDeletion = {sideName: 'remote', type: 'FileDeletion', doc: Metadata}
export type RemoteFileDissociation = {sideName: 'remote', type: 'FileDissociation', doc: Metadata, was: Metadata}
export type RemoteFileMove = {sideName: 'remote', type: 'FileMove', doc: Metadata, was: Metadata, needRefetch?: true, update?: true}
export type RemoteFileRestoration = {sideName: 'remote', type: 'FileRestoration', doc: Metadata, was: Metadata}
export type RemoteFileTrashing = {sideName: 'remote', type: 'FileTrashing', doc: Metadata, was: Metadata}
export type RemoteFileUpdate = {sideName: 'remote', type: 'FileUpdate', doc: Metadata}
export type RemoteDirAddition = {sideName: 'remote', type: 'DirAddition', doc: Metadata, was: Metadata}
export type RemoteDirDeletion = {sideName: 'remote', type: 'DirDeletion', doc: Metadata}
export type RemoteDirDissociation = {sideName: 'remote', type: 'DirDissociation', doc: Metadata, was: Metadata}
export type RemoteDirMove = {sideName: 'remote', type: 'DirMove', doc: Metadata, was: Metadata, needRefetch?: true}
export type RemoteDirRestoration = {sideName: 'remote', type: 'DirRestoration', doc: Metadata, was: Metadata}
export type RemoteDirTrashing = {sideName: 'remote', type: 'DirTrashing', doc: Metadata, was: Metadata}

export type RemoteChange =
  | RemoteDirAddition
  | RemoteDirDeletion
  | RemoteDirDissociation
  | RemoteDirMove
  | RemoteDirRestoration
  | RemoteDirTrashing
  | RemoteFileAddition
  | RemoteFileDeletion
  | RemoteFileDissociation
  | RemoteFileMove
  | RemoteFileRestoration
  | RemoteFileTrashing
  | RemoteFileUpdate

export type RemoteIgnoredChange = {type: 'RemoteIgnoredChange', doc: Metadata|RemoteDoc|RemoteDeletion, detail: string}
export type RemoteInvalidChange = {type: 'RemoteInvalidChange', doc: *, error: Error}
export type RemoteUpToDate = {type: 'RemoteUpToDate', doc: Metadata, was: Metadata}

export type RemoteNoise =
  | RemoteIgnoredChange
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
  dissociated,
  isChildMove,
  isOnlyChildMove,
  applyMoveToPath,
  sort
}

const sideName = 'remote'

// FIXME: return types
function added (doc /*: Metadata */) /*: * */ {
  return {sideName, type: (isFile(doc) ? 'FileAddition' : 'DirAddition'), doc}
}

function trashed (doc /*: Metadata */, was /*: Metadata */) /*: * */ {
  return {sideName, type: (isFile(doc) ? 'FileTrashing' : 'DirTrashing'), doc, was}
}

function deleted (doc /*: Metadata */) /*: * */ {
  return {sideName, type: (isFile(doc) ? 'FileDeletion' : 'DirDeletion'), doc}
}

function restored (doc /*: Metadata */, was /*: Metadata */) /*: * */ {
  return {sideName, type: (isFile(doc) ? 'FileRestoration' : 'DirRestoration'), doc, was}
}

function upToDate (doc /*: Metadata */, was /*: Metadata */) /*: * */ {
  return {sideName, type: 'RemoteUpToDate', doc, was}
}

function updated (doc /*: Metadata */) /*: * */ {
  return {sideName, type: (isFile(doc) ? 'FileUpdate' : 'DirAddition'), doc}
}

function dissociated (doc /*: Metadata */, was /*: Metadata */) /*: * */ {
  return {sideName, type: (isFile(doc) ? 'FileDissociation' : 'DirDissociation'), doc, was}
}

// TODO: Rename args
function isChildMove (a /*: RemoteChange|RemoteNoise */, b /*: RemoteChange|RemoteNoise */) /*: boolean %checks */ {
  return a.type === 'DirMove' &&
        (b.type === 'DirMove' || b.type === 'FileMove') &&
        (b.doc.path.indexOf(a.doc.path + path.sep) === 0) &&
        a.was && b.was &&
        (b.was.path.indexOf(a.was.path + path.sep) === 0) &&
        a.type === 'DirMove' &&
        (b.type === 'DirMove' || b.type === 'FileMove')
}

/*     was           doc
 a    /a     ->    /a2
 b    /a/b   ->    /a2/b
*/
function isOnlyChildMove (a /*: RemoteDirMove */, b /*: RemoteFileMove|RemoteDirMove */) /*: boolean %checks */ {
  return isChildMove(a, b) && b.doc.path.replace(a.doc.path, '') === b.was.path.replace(a.was.path, '')
}

function applyMoveToPath (a /*: RemoteDirMove */, p /*: string */) /*: string */ {
  return p.replace(a.was.path, a.doc.path)
}

const isDelete = (a /*: RemoteChange|RemoteNoise */) /*: boolean %checks */ => a.type === 'DirDeletion' || a.type === 'FileDeletion'
const isAdd = (a /*: RemoteChange|RemoteNoise */) /*: boolean %checks */ => a.type === 'DirAddition' || a.type === 'FileAddition'
const isMove = (a /*: RemoteChange|RemoteNoise */) /*: boolean %checks */ => a.type === 'DirMove' || a.type === 'FileMove'
const isTrash = (a /*: RemoteChange|RemoteNoise */) /*: boolean %checks */ => a.type === 'DirTrashing' || a.type === 'FileTrashing'
const isRestore = (a /*: RemoteChange|RemoteNoise */) /*: boolean %checks */ => a.type === 'DirRestoration' || a.type === 'FileRestoration'
const isDissociate = (a /*: RemoteChange|RemoteNoise */) /*: boolean %checks */ => a.type === 'DirDissociation' || a.type === 'FileDissociation'

const addPath = (a /*: RemoteChange|RemoteNoise */) /*: ?string */ => isAdd(a) || isMove(a) || isRestore(a) || isDissociate(a) ? a.doc.path : null
const delPath = (a /*: RemoteChange|RemoteNoise */) /*: ?string */ => isDelete(a) ? a.doc.path : isMove(a) || isTrash(a) ? a.was.path : null
const childOf = (p1 /*: ?string */, p2 /*: ?string */)/*: boolean */ => p1 != null && p2 != null && p2 !== p1 && p2.startsWith(p1 + path.sep)
const lower = (p1 /*: ?string */, p2 /*: ?string */)/*: boolean */ => p1 != null && p2 != null && p2 !== p1 && p1 < p2

const isChildDelete = (a /*: RemoteChange|RemoteNoise */, b /*: RemoteChange|RemoteNoise */) => childOf(delPath(a), delPath(b))
const isChildAdd = (a /*: RemoteChange|RemoteNoise */, b /*: RemoteChange|RemoteNoise */) => childOf(addPath(a), addPath(b))

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

function sort (changes /*: Array<RemoteChange|RemoteNoise> */) /*: void */ {
  changes.sort(sorter)
}
