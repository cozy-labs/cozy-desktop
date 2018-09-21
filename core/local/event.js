/* @flow */

/*::
import type { Metadata } from '../metadata'
import type {
  ChokidarAdd,
  ChokidarAddDir,
  ChokidarChange,
  ChokidarUnlink,
  ChokidarUnlinkDir
} from './chokidar_event'

export type LocalDirAdded = ChokidarAddDir & {old: ?Metadata, wip?: true}
export type LocalDirUnlinked = ChokidarUnlinkDir & {old: ?Metadata}
export type LocalFileAdded = ChokidarAdd & {old: ?Metadata, md5sum: string, wip?: true}
export type LocalFileUnlinked = ChokidarUnlink & {old: ?Metadata}
export type LocalFileUpdated = ChokidarChange & {old: ?Metadata, md5sum: string, wip?: true}

export type LocalEvent =
  | LocalDirAdded
  | LocalDirUnlinked
  | LocalFileAdded
  | LocalFileUnlinked
  | LocalFileUpdated
*/

module.exports = {
  getInode
}

function getInode (e /*: LocalEvent */) /*: ?number */ {
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
