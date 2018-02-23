/* @flow */

import fs from 'fs'
import _ from 'lodash'
import path from 'path'

import logger from '../logger'

import type { Metadata } from '../metadata'
import type {
  LocalDirAdded,
  LocalDirUnlinked,
  LocalEvent,
  LocalFileAdded,
  LocalFileUnlinked
} from './event'

const log = logger({
  component: 'LocalWatcher'
})

export type LocalDirDeletion = {sideName: 'local', type: 'LocalDirDeletion', path: string, old: ?Metadata, ino: ?number}
export type LocalFileDeletion = {sideName: 'local', type: 'LocalFileDeletion', path: string, old: ?Metadata, ino: ?number}
export type LocalDirAddition = {sideName: 'local', type: 'LocalDirAddition', path: string, ino: number, stats: fs.Stats, wip?: true}
export type LocalFileUpdate = {sideName: 'local', type: 'LocalFileUpdate', path: string, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type LocalFileAddition = {sideName: 'local', type: 'LocalFileAddition', path: string, ino: number, stats: fs.Stats, md5sum: string, wip?: true}
export type LocalFileMove = {sideName: 'local', type: 'LocalFileMove', path: string, old: Metadata, ino: number, stats: fs.Stats, md5sum: string, wip?: true, needRefetch: boolean}
export type LocalDirMove = {sideName: 'local', type: 'LocalDirMove', path: string, old: Metadata, ino: number, stats: fs.Stats, wip?: true, needRefetch: boolean}

export type LocalChange =
  | LocalDirDeletion
  | LocalFileDeletion
  | LocalFileAddition
  | LocalDirAddition
  | LocalFileUpdate
  | LocalFileMove
  | LocalDirMove

const sideName = 'local'

// TODO: Introduce specific builders?
export const build = (type: string, path: string, opts?: {stats?: fs.Stats, md5sum?: string, old?: ?Metadata}): LocalChange => {
  const change: Object = _.assign({sideName, type, path}, opts)
  if (change.wip == null) delete change.wip
  if (change.md5sum == null) delete change.md5sum
  return change
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
      return {sideName, type: 'LocalDirDeletion', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'unlink':
      return {sideName, type: 'LocalFileDeletion', path: e.path, old: e.old, ino: (e.old != null ? e.old.ino : null)}
    case 'addDir':
      return {sideName, type: 'LocalDirAddition', path: e.path, stats: e.stats, ino: e.stats.ino}
    case 'change':
      return {sideName, type: 'LocalFileUpdate', path: e.path, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    case 'add':
      return {sideName, type: 'LocalFileAddition', path: e.path, stats: e.stats, ino: e.stats.ino, md5sum: e.md5sum, wip: e.wip}
    default:
      throw new TypeError(`wrong type ${e.type}`) // @TODO FlowFixMe
  }
}

export const fileMoveFromUnlinkAdd = (unlinkChange: LocalFileDeletion, e: LocalFileAdded): * => {
  log.debug({oldpath: unlinkChange.path, path: e.path, ino: unlinkChange.ino}, 'File moved')
  return build('LocalFileMove', e.path, {
    stats: e.stats,
    md5sum: e.md5sum,
    old: unlinkChange.old,
    ino: unlinkChange.ino,
    wip: e.wip
  })
}

export const dirMoveFromUnlinkAdd = (unlinkChange: LocalDirDeletion, e: LocalDirAdded): * => {
  log.debug({oldpath: unlinkChange.path, path: e.path}, 'moveFolder')
  return build('LocalDirMove', e.path, {
    stats: e.stats,
    old: unlinkChange.old,
    ino: unlinkChange.ino,
    wip: e.wip
  })
}

export const fileMoveFromAddUnlink = (addChange: LocalFileAddition, e: LocalFileUnlinked): * => {
  log.debug({oldpath: e.path, path: addChange.path, ino: addChange.ino}, 'File moved')
  return build('LocalFileMove', addChange.path, {
    stats: addChange.stats,
    md5sum: addChange.md5sum,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })
}

export const dirMoveFromAddUnlink = (addChange: LocalDirAddition, e: LocalDirUnlinked): * => {
  log.debug({oldpath: e.path, path: addChange.path}, 'moveFolder')
  return build('LocalDirMove', addChange.path, {
    stats: addChange.stats,
    old: e.old,
    ino: addChange.ino,
    wip: addChange.wip
  })
}

export type LocalMove = LocalFileMove|LocalDirMove

export type LocalMoveEvent = LocalFileAdded|LocalDirAdded

function InvalidLocalMoveEvent (moveChange: LocalMove, event: LocalMoveEvent) {
  this.name = 'InvalidLocalMoveEvent'
  this.moveChange = moveChange
  this.event = event
  // FIXME: Include event/change details in message
  this.message = `Cannot include event ${event.type} into change ${moveChange.type}`
  Error.captureStackTrace(this, this.constructor)
}

const ensureValidMoveEvent = (moveChange: LocalMove, event: LocalMoveEvent) => {
  /* istanbul ignore next */
  if (!moveChange.wip) throw new InvalidLocalMoveEvent(moveChange, event)
}

export const includeAddEventInFileMove = (moveChange: LocalFileMove, e: LocalFileAdded) => {
  ensureValidMoveEvent(moveChange, e)
  moveChange.path = e.path
  moveChange.stats = e.stats
  moveChange.md5sum = e.md5sum
  delete moveChange.wip
  log.debug(
    {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
    'File move completing')
}

export const includeAddDirEventInDirMove = (moveChange: LocalDirMove, e: LocalDirAdded) => {
  ensureValidMoveEvent(moveChange, e)
  moveChange.path = e.path
  moveChange.stats = e.stats
  delete moveChange.wip
  log.debug(
   {path: e.path, oldpath: moveChange.old.path, ino: moveChange.stats.ino},
   'Folder move completing')
}

export const convertFileMoveToDeletion = (change: LocalFileMove) => {
  log.debug({path: change.old.path, ino: change.ino},
    'File was moved then deleted. Deleting origin directly.')
  // $FlowFixMe
  change.type = 'LocalFileDeletion'
  change.path = change.old.path
  delete change.stats
  delete change.wip
}
