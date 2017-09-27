/* @flow */

import fs from 'fs'
import type {ChokidarFSEvent} from './chokidar_event'

type PrepFSEventType = 'moveFileAsync'
  | 'addFileAsync'
  | 'putFolderAsync'
  | 'trashFileAsync'
  | 'trashFolderAsync'
  | 'updateFileAsync'

export type PrepFSEvent = {
  action: PrepFSEventType,
  sourceEvents: ChokidarFSEvent[]
}

export const build = (type: string, path?: string, stats?: fs.Stats): ChokidarFSEvent => {
  const event: Object = {type}
  if (path != null) event.path = path
  if (stats != null) event.stats = stats
  return event
}
