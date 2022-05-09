/**
 * @module core/local/atom/events
 * @flow
 */

/*::
import type { Stats } from '../stater'

export type EventAction =
  | 'created'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'scan'
  | 'initial-scan-done'
  | 'ignored'
export type EventKind =
  | 'file'
  | 'directory'
  | 'symlink'
  | 'unknown'

export type AtomEvent = {
  action: EventAction,
  kind: EventKind,
  path: string,
  ino?: number|string,
  oldPath?: string,
  _id?: string,
  stats?: Stats,
  deletedIno?: number|string,
  md5sum?: string,
  incomplete?: bool,
  noIgnore?: bool,
  overwrite?: bool
}

export type AtomBatch = AtomEvent[]
*/

const ACTIONS /*: EventAction[] */ = [
  'created',
  'modified',
  'deleted',
  'renamed',
  'scan',
  'initial-scan-done',
  'ignored'
]
const KINDS /*: EventKind[] */ = ['file', 'directory', 'symlink', 'unknown']

const INITIAL_SCAN_DONE = {
  action: 'initial-scan-done',
  kind: 'unknown',
  path: '.',
  noIgnore: true
}

module.exports = {
  ACTIONS,
  INITIAL_SCAN_DONE,
  KINDS
}
