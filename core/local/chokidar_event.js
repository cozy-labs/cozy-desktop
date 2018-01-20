/* @flow */

import fs from 'fs'
import type { Metadata } from '../metadata'

type ChokidarAdd = {type: 'add', path: string, stats: fs.Stats}
type ChokidarAddDir = {type: 'addDir', path: string, stats: fs.Stats}
type ChokidarChange = {type: 'change', path: string, stats: fs.Stats}
type ChokidarUnlink = {type: 'unlink', path: string}
type ChokidarUnlinkDir = {type: 'unlinkDir', path: string}

export type ChokidarFSEvent =
  | ChokidarAdd
  | ChokidarAddDir
  | ChokidarChange
  | ChokidarUnlink
  | ChokidarUnlinkDir

export const build = (type: string, path?: string, stats?: fs.Stats): ChokidarFSEvent => {
  const event: Object = {type}
  if (path != null) event.path = path
  if (stats != null) event.stats = stats
  return event
}

type ContextualizedChokidarAdd = ChokidarAdd & {md5sum: string, wip?: true}
type ContextualizedChokidarAddDir = ChokidarAddDir & {wip?: true}
type ContextualizedChokidarChange = ChokidarChange & {md5sum: string, wip?: true}
type ContextualizedChokidarUnlink = ChokidarUnlink & {old: ?Metadata}
type ContextualizedChokidarUnlinkDir = ChokidarUnlinkDir & {old: ?Metadata}

export type ContextualizedChokidarFSEvent =
  | ContextualizedChokidarAdd
  | ContextualizedChokidarAddDir
  | ContextualizedChokidarChange
  | ContextualizedChokidarUnlink
  | ContextualizedChokidarUnlinkDir

export const getInode = (e: ContextualizedChokidarFSEvent): ?number => {
  switch (e.type) {
    case 'add':
    case 'addDir':
    case 'change':
      return e.stats.ino
    case 'unlink':
    case 'unlinkDir':
      if (e.old != null) return e.old.ino
  }
}
