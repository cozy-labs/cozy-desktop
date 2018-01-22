/* @flow */

import fs from 'fs'
import _ from 'lodash'
import path from 'path'

import type { Metadata } from '../metadata'
import type { LocalEvent } from './event'

export type LocalDirDeletion = {type: 'LocalDirDeletion', path: string, old: ?Metadata, ino: ?number}
export type LocalFileDeletion = {type: 'LocalFileDeletion', path: string, old: ?Metadata, ino: ?number}
export type LocalDirAddition = {type: 'LocalDirAddition', path: string, ino: number, stats: fs.Stats, wip?: true}
export type LocalFileUpdate = {type: 'LocalFileUpdate', path: string, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type LocalFileAddition = {type: 'LocalFileAddition', path: string, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type LocalFileMove = {type: 'LocalFileMove', path: string, old: Metadata, ino: number, stats: fs.Stats, md5sum: string, wip?: true, needRefetch: boolean}
export type LocalDirMove = {type: 'LocalDirMove', path: string, old: Metadata, ino: number, stats: fs.Stats, wip?: true, needRefetch: boolean}

export type LocalChange =
  | LocalDirDeletion
  | LocalFileDeletion
  | LocalFileAddition
  | LocalDirAddition
  | LocalFileUpdate
  | LocalFileMove
  | LocalDirMove

// TODO: Introduce specific builders?
export const build = (type: string, path: string, opts?: {stats?: fs.Stats, md5sum?: string, old?: ?Metadata}): LocalChange => {
  const event: Object = _.assign({type, path}, opts)
  if (event.wip == null) delete event.wip
  if (event.md5sum == null) delete event.md5sum
  return event
}

export const maybeAddFile = (a: ?LocalChange): ?LocalFileAddition => (a && a.type === 'LocalFileAddition') ? a : null
export const maybePutFolder = (a: ?LocalChange): ?LocalDirAddition => (a && a.type === 'LocalDirAddition') ? a : null
export const maybeMoveFile = (a: ?LocalChange): ?LocalFileMove => (a && a.type === 'LocalFileMove') ? a : null
export const maybeMoveFolder = (a: ?LocalChange): ?LocalDirMove => (a && a.type === 'LocalDirMove') ? a : null
export const maybeDeleteFile = (a: ?LocalChange): ?LocalFileDeletion => (a && a.type === 'LocalFileDeletion') ? a : null
export const maybeDeleteFolder = (a: ?LocalChange): ?LocalDirDeletion => (a && a.type === 'LocalDirDeletion') ? a : null

export const find = <T>(changes: LocalChange[], maybeRightType: (LocalChange) => ?T, predicate: (T) => boolean, remove?: true): ?T => {
  for (let i = 0; i < changes.length; i++) {
    const anyChange = changes[i]
    const rightTypeChange: ?T = maybeRightType(anyChange)
    if (rightTypeChange != null && predicate(rightTypeChange)) {
      if (remove) changes.splice(i, 1)
      return rightTypeChange
    }
  }
}

export const isChildMove = (a: LocalChange, b: LocalChange): boolean %checks => {
  return a.type === 'LocalDirMove' &&
         (b.type === 'LocalDirMove' || b.type === 'LocalFileMove') &&
        b.path.indexOf(a.path + path.sep) === 0 &&
        a.old && b.old &&
        b.old.path.indexOf(a.old.path + path.sep) === 0
}

const isDelete = (a: LocalChange): boolean %checks => a.type === 'LocalDirDeletion' || a.type === 'LocalFileDeletion'
const isAdd = (a: LocalChange): boolean %checks => a.type === 'LocalDirAddition' || a.type === 'LocalFileAddition'
const isMove = (a: LocalChange): boolean %checks => a.type === 'LocalDirMove' || a.type === 'LocalFileMove'

export const addPath = (a: LocalChange): ?string => isAdd(a) || isMove(a) ? a.path : null
export const delPath = (a: LocalChange): ?string => isDelete(a) ? a.path : isMove(a) ? a.old.path : null
export const childOf = (p1: ?string, p2: ?string): boolean => p1 != null && p2 != null && p2 !== p1 && p2.startsWith(p1 + path.sep)
export const lower = (p1: ?string, p2: ?string): boolean => p1 != null && p2 != null && p2 !== p1 && p1 < p2

export const isChildDelete = (a: LocalChange, b: LocalChange) => childOf(delPath(a), delPath(b))
export const isChildAdd = (a: LocalChange, b: LocalChange) => childOf(addPath(a), addPath(b))

// $FlowFixMe
export const toString = (a: LocalChange): string => '(' + a.type + ': ' + (a.old && a.old.path) + '-->' + a.path + ')'

export const fromEvent = (e: LocalEvent) : LocalChange => {
  switch (e.type) {
    case 'unlinkDir':
      return {type: 'LocalDirDeletion', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'unlink':
      return {type: 'LocalFileDeletion', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'addDir':
      return {type: 'LocalDirAddition', path: e.path, stats: e.stats, ino: e.stats.ino}
    case 'change':
      return {type: 'LocalFileUpdate', path: e.path, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    case 'add':
      return {type: 'LocalFileAddition', path: e.path, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    default:
      throw new TypeError(`wrong type ${e.type}`) // @TODO FlowFixMe
  }
}
