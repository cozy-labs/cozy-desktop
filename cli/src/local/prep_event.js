/* @flow */

import fs from 'fs'
import type {Metadata} from '../metadata'

export type UnlinkDir = {type: 'UnlinkDir', path: string}
export type UnlinkFile = {type: 'UnlinkFile', path: string}
export type AddDir = {type: 'AddDir', path: string, stats: fs.Stats}
export type Change = {type: 'Change', path: string, stats: fs.Stats, md5sum: string}
export type AddFile = {type: 'AddFile', path: string, stats: fs.Stats, md5sum: string, old: ?Metadata}

export type PrepFSEvent =
  | UnlinkDir
  | UnlinkFile
  | AddFile
  | AddDir
  | Change

export const build = (type: string, path?: string, stats?: fs.Stats, md5sum?: string, old?: ?Metadata): PrepFSEvent => {
  const event: Object = {type, path, stats, md5sum, old}
  return event
}
