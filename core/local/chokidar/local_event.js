/** A {@link module:core/local/chokidar/event|ChokidarEvent} with some context:
 *
 * - The corresponding `old` {@link module:core/metadata|Metadata} present in
 *   the {@link module:core/pouch|Pouch}.
 * - An `md5sum` when relevant
 * - A `wip` flag indicating whether the event is incomplete or not
 *
 * @module core/local/chokidar/local_event
 * @flow
 */

/*::
import type { SavedMetadata } from '../../metadata'
import type {
  ChokidarAdd,
  ChokidarAddDir,
  ChokidarChange,
  ChokidarUnlink,
  ChokidarUnlinkDir
} from './event'

export type LocalDirAdded = ChokidarAddDir & {
  old: ?SavedMetadata,
  wip?: true
}
export type LocalDirUnlinked = ChokidarUnlinkDir & {
  old: ?SavedMetadata
}
export type LocalFileAdded = ChokidarAdd & {
  old: ?SavedMetadata,
  md5sum: string,
  wip?: true
}
export type LocalFileUnlinked = ChokidarUnlink & {
  old: ?SavedMetadata
}
export type LocalFileUpdated = ChokidarChange & {
  old: ?SavedMetadata,
  md5sum: string,
  wip?: true
}

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

function getInode(e /*: LocalEvent */) /*: ?number */ {
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
