/** Raw chokidar events
 *
 * @module core/local/chokidar/event
 * @flow
 */

/*::
import type fs from 'fs'
import type {Metadata} from '../../metadata'

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
  old?: Metadata
}
export type ChokidarUnlinkDir = {
  type: 'unlinkDir',
  path: string,
  old?: Metadata
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
  const event /*: Object */ = { type }
  if (path != null) event.path = path
  if (stats != null) event.stats = stats
  return event
}

function pretendUnlinkFromMetadata(
  doc /*: Metadata */
) /*: ChokidarUnlink|ChokidarUnlinkDir */ {
  const type = doc.docType === 'file' ? 'unlink' : 'unlinkDir'
  const path = doc.path
  // $FlowFixMe
  return { type, path, old: doc }
}
