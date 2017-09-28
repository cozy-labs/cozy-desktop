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

type ContextualizedChokidarAdd = ChokidarAdd & {md5sum: string, old: ?Metadata}
type ContextualizedChokidarAddDir = ChokidarAddDir & {ino: string}
type ContextualizedChokidarChange = ChokidarChange & {md5sum: string}
type ContextualizedChokidarUnlink = ChokidarUnlink
type ContextualizedChokidarUnlinkDir = ChokidarUnlinkDir

export type ContextualizedChokidarFSEvent =
  | ContextualizedChokidarAdd
  | ContextualizedChokidarAddDir
  | ContextualizedChokidarChange
  | ContextualizedChokidarUnlink
  | ContextualizedChokidarUnlinkDir
