/* @flow */

/*::
import type fs from 'fs'

export type ChokidarAdd = {type: 'add', path: string, stats: fs.Stats}
export type ChokidarAddDir = {type: 'addDir', path: string, stats: fs.Stats}
export type ChokidarChange = {type: 'change', path: string, stats: fs.Stats}
export type ChokidarUnlink = {type: 'unlink', path: string}
export type ChokidarUnlinkDir = {type: 'unlinkDir', path: string}

export type ChokidarEvent =
  | ChokidarAdd
  | ChokidarAddDir
  | ChokidarChange
  | ChokidarUnlink
  | ChokidarUnlinkDir
*/

module.exports = {
  build
}

function build (type /*: string */, path /*: ?string */, stats /*: ?fs.Stats */) /*: ChokidarEvent */ {
  const event /*: Object */ = {type}
  if (path != null) event.path = path
  if (stats != null) event.stats = stats
  return event
}
