/* @flow */

import fs from 'fs'
import _ from 'lodash'
import path from 'path'

import type { Metadata } from '../metadata'
import type { ContextualizedChokidarFSEvent } from './chokidar_event'

export type PrepDeleteFolder = {type: 'PrepDeleteFolder', path: string, old: ?Metadata, ino: ?number}
export type PrepDeleteFile = {type: 'PrepDeleteFile', path: string, old: ?Metadata, ino: ?number}
export type PrepPutFolder = {type: 'PrepPutFolder', path: string, ino: number, stats: fs.Stats, wip?: true}
export type PrepUpdateFile = {type: 'PrepUpdateFile', path: string, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type PrepAddFile = {type: 'PrepAddFile', path: string, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type PrepMoveFile = {type: 'PrepMoveFile', path: string, old: Metadata, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type PrepMoveFolder = {type: 'PrepMoveFolder', path: string, old: Metadata, ino: number, stats: fs.Stats, wip?: true}

export type PrepAction =
  | PrepDeleteFolder
  | PrepDeleteFile
  | PrepAddFile
  | PrepPutFolder
  | PrepUpdateFile
  | PrepMoveFile
  | PrepMoveFolder

// TODO: Introduce specific builders?
export const build = (type: string, path: string, opts?: {stats?: fs.Stats, md5sum?: string, old?: ?Metadata}): PrepAction => {
  const event: Object = _.assign({type, path}, opts)
  if (event.wip == null) delete event.wip
  return event
}

export const maybeAddFile = (a: ?PrepAction): ?PrepAddFile => (a && a.type === 'PrepAddFile') ? a : null
export const maybePutFolder = (a: ?PrepAction): ?PrepPutFolder => (a && a.type === 'PrepPutFolder') ? a : null
export const maybeMoveFile = (a: ?PrepAction): ?PrepMoveFile => (a && a.type === 'PrepMoveFile') ? a : null
export const maybeMoveFolder = (a: ?PrepAction): ?PrepMoveFolder => (a && a.type === 'PrepMoveFolder') ? a : null
export const maybeDeleteFile = (a: ?PrepAction): ?PrepDeleteFile => (a && a.type === 'PrepDeleteFile') ? a : null
export const maybeDeleteFolder = (a: ?PrepAction): ?PrepDeleteFolder => (a && a.type === 'PrepDeleteFolder') ? a : null

export const find = <T>(actions: PrepAction[], maybeRightType: (PrepAction) => ?T, predicate: (T) => boolean, remove?: true): ?T => {
  for (let i = 0; i < actions.length; i++) {
    const anyAction = actions[i]
    const rightTypeAction: ?T = maybeRightType(anyAction)
    if (rightTypeAction != null && predicate(rightTypeAction)) {
      if (remove) actions.splice(i, 1)
      return rightTypeAction
    }
  }
}

export const isChildMove = (a: PrepAction, b: PrepAction) => {
  return a.type === 'PrepMoveFolder' &&
         (b.type === 'PrepMoveFolder' || b.type === 'PrepMoveFile') &&
        b.path.indexOf(a.path + path.sep) === 0 &&
        a.old && b.old &&
        b.old.path.indexOf(a.old.path + path.sep) === 0
}

const isDelete = (a: PrepAction): boolean %checks => a.type === 'PrepDeleteFolder' || a.type === 'PrepDeleteFile'
const isAdd = (a: PrepAction): boolean %checks => a.type === 'PrepPutFolder' || a.type === 'PrepAddFile'
const isMove = (a: PrepAction): boolean %checks => a.type === 'PrepMoveFolder' || a.type === 'PrepMoveFile'

export const addPath = (a: PrepAction): ?string => isAdd(a) || isMove(a) ? a.path : null
export const delPath = (a: PrepAction): ?string => isDelete(a) ? a.path : isMove(a) ? a.old.path : null
export const childOf = (p1: ?string, p2: ?string): boolean => p1 != null && p2 != null && p2 !== p1 && p2.startsWith(p1 + path.sep)
export const lower = (p1: ?string, p2: ?string): boolean => p1 != null && p2 != null && p2 !== p1 && p1 < p2

export const isChildDelete = (a: PrepAction, b: PrepAction) => childOf(delPath(a), delPath(b))
export const isChildAdd = (a: PrepAction, b: PrepAction) => childOf(addPath(a), addPath(b))

// $FlowFixMe
export const toString = (a: PrepAction): string => '(' + a.type + ': ' + (a.old && a.old.path) + '-->' + a.path + ')'

export const fromChokidar = (e: ContextualizedChokidarFSEvent) : PrepAction => {
  switch (e.type) {
    case 'unlinkDir':
      return {type: 'PrepDeleteFolder', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'unlink':
      return {type: 'PrepDeleteFile', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'addDir':
      return {type: 'PrepPutFolder', path: e.path, stats: e.stats, ino: e.stats.ino}
    case 'change':
      return {type: 'PrepUpdateFile', path: e.path, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    case 'add':
      return {type: 'PrepAddFile', path: e.path, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    default:
      throw new TypeError(`wrong type ${e.type}`) // @TODO FlowFixMe
  }
}
