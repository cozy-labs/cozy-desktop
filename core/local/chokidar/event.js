/** Raw events as provided by {@link https://github.com/paulmillr/chokidar/|chokidar}.
 *
 * Including `stats` because our chokidar watcher is configured to always
 * retrieve them.
 *
 * ## Known issues
 *
 * - We're not sure chokidar maintains the events order with stats.
 * - _unlink*_ events may have an `old` {@link module:core/metadata|Metadata}
 *   attribute attached because of the unfortunate design decision to include
 *   the corresponding existing doc as soon as possible when issuing deleted
 *   events during the initial scan.
 *
 * @module core/local/chokidar/event
 * @flow
 */

const stater = require('../stater')

/*::
import type fs from 'fs'
import type { SavedMetadata } from '../../metadata'

export type ChokidarAdd = {
  type: 'add',
  path: string,
  stats: fs.Stats
}
export type ChokidarAddDir = {
  type: 'addDir',
  path: string,
  stats: fs.Stats
}
export type ChokidarChange = {
  type: 'change',
  path: string,
  stats: fs.Stats
}
export type ChokidarUnlink = {
  type: 'unlink',
  path: string,
  old?: SavedMetadata
}
export type ChokidarUnlinkDir = {
  type: 'unlinkDir',
  path: string,
  old?: SavedMetadata
}

export type ChokidarEvent =
  | ChokidarAdd
  | ChokidarAddDir
  | ChokidarChange
  | ChokidarUnlink
  | ChokidarUnlinkDir
*/

module.exports = {
  build,
  pretendUnlinkFromMetadata
}

function build(
  type /*: string */,
  path /*: ?string */,
  stats /*: ?fs.Stats */
) /*: ChokidarEvent */ {
  const event /*: Object */ = { type: eventType(type, stats) }
  if (path != null) event.path = path
  if (stats != null) event.stats = stats
  return event
}

/**
 * Makes sure the event type matches the document's type.
 *
 * This is necessary because chokidar/fsevents can fire `add` events for
 * directories and `addDir` events for files, making their handling error prone
 * (e.g. computing the checksum of a directory).
 *
 * @return string
 */
function eventType(type /*: string */, stats /*: ?fs.Stats */) /*: string */ {
  if (stats == null) return type

  switch (type) {
    case 'add':
      return stater.isDirectory(stats) ? 'addDir' : 'add'
    case 'addDir':
      return stater.isDirectory(stats) ? 'addDir' : 'add'
    default:
      return type
  }
}

function pretendUnlinkFromMetadata(
  doc /*: SavedMetadata */
) /*: ChokidarUnlink|ChokidarUnlinkDir */ {
  const type = doc.docType === 'file' ? 'unlink' : 'unlinkDir'
  const path = doc.path
  // $FlowFixMe
  return { type, path, old: doc }
}
