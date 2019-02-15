/* @flow */

/*::
import type { Stats } from 'fs'

export type EventAction =
  | 'created'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'scan'
  | 'initial-scan-done'
export type EventKind =
  | 'file'
  | 'directory'
  | 'symlink'
  | 'unknown'

export type AtomWatcherEvent = {
  action: EventAction,
  kind: EventKind,
  path: string,
  oldPath?: string,
  _id?: string,
  stats?: Stats,
  md5sum?: string,
  incomplete?: bool,
  noIgnore?: bool,
  overwrite?: bool
}

export type Batch = AtomWatcherEvent[]
*/

const ACTIONS /*: EventAction[] */ = [
  'created', 'modified', 'deleted', 'renamed', 'scan', 'initial-scan-done'
]
const KINDS /*: EventKind[] */ = [
  'file', 'directory', 'symlink', 'unknown'
]

module.exports = {
  ACTIONS,
  KINDS
}
