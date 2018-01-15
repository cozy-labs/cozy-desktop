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

type ContextualizedChokidarAdd = {type: 'add', path: string, stats: fs.Stats, md5sum: string, wip?: true}
type ContextualizedChokidarAddDir = {type: 'addDir', path: string, stats: fs.Stats, wip?: true}
type ContextualizedChokidarChange = {type: 'change', path: string, stats: fs.Stats, md5sum: string, wip?: true}
type ContextualizedChokidarUnlink = {type: 'unlink', old: ?Metadata, path: string}
type ContextualizedChokidarUnlinkDir = {type: 'unlinkDir', old: ?Metadata, path: string}

export type ContextualizedChokidarFSEvent =
  | ContextualizedChokidarAdd
  | ContextualizedChokidarAddDir
  | ContextualizedChokidarChange
  | ContextualizedChokidarUnlink
  | ContextualizedChokidarUnlinkDir
