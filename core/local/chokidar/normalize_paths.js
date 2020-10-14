/** Match LocalEvents paths with their existing normalization
 *
 * @module core/local/chokidar/normalize_paths
 * @flow
 */

const Promise = require('bluebird')
const path = require('path')

const logger = require('../../utils/logger')

const log = logger({
  component: 'chokidar/normalize_paths'
})

/*::
import type {  } from './local_change'
import type { Metadata } from '../../metadata'
import type { Pouch } from '../../pouch'
import type {
  LocalChange,
  LocalDirAddition,
  LocalDirDeletion,
  LocalDirMove,
  LocalFileAddition,
  LocalFileDeletion,
  LocalFileMove,
  LocalFileUpdate
} from './local_change'

type Change =
  | LocalDirAddition
  | LocalDirDeletion
  | LocalDirMove
  | LocalFileAddition
  | LocalFileDeletion
  | LocalFileMove
  | LocalFileUpdate

type NormalizePathsOpts = {
  pouch: Pouch,
}
*/

const step = async (
  changes /*: LocalChange[] */,
  { pouch } /*: NormalizePathsOpts */
) /*: Promise<LocalChange[]> */ => {
  const normalizedPaths = []

  return new Promise.mapSeries(changes, async (
    c /*: LocalChange */
  ) /*: Promise<LocalChange> */ => {
    if (c.type !== 'Ignored') {
      const parentPath = path.dirname(c.path)
      const parent =
        parentPath !== '.' ? await pouch.bySyncedPath(parentPath) : null
      c.path = normalizedPath(
        c.path,
        c.old && c.old.path,
        parent,
        normalizedPaths
      )
      normalizedPaths.push(c.path)

      if (c.path !== normalizedPath) {
        log.info(
          { path: c.path, normalizedPath },
          'normalizing local path to match existing doc and parent norms'
        )
      }
    }

    return c
  })
}

const previouslyNormalizedPath = (
  docPath /*: string */,
  normalizedPaths /*: string[] */
) /*: ?string */ =>
  normalizedPaths.find(p => p.normalize() === docPath.normalize())

const isNFD = string => string === string.normalize('NFD')

const normalizedPath = (
  newPath /*: string */,
  oldPath /*: ?string */,
  parent /*: ?Metadata */,
  normalizedPaths /*: string[] */
) /*: string */ => {
  // Curent change's path parts
  const name = path.basename(newPath)
  const parentPath = path.dirname(newPath)

  const normalizedParentPath = parent
    ? parent.path
    : parentPath != '.'
    ? previouslyNormalizedPath(parentPath, normalizedPaths) || parentPath
    : ''
  const oldName = oldPath && path.basename(oldPath)
  const normalizedName = oldName
    ? isNFD(oldName)
      ? name.normalize('NFD')
      : name.normalize('NFC')
    : name

  return path.join(normalizedParentPath, normalizedName)
}

module.exports = {
  step,
  normalizedPath
}
