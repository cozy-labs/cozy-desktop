/** Match LocalEvents paths with their existing normalization
 *
 * @module core/local/chokidar/normalize_paths
 * @flow
 */

const Promise = require('bluebird')
const path = require('path')

const metadata = require('../../metadata')
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

  return new Promise.map(changes, async (
    c /*: LocalChange */
  ) /*: Promise<LocalChange> */ => {
    if (c.type !== 'Ignored') {
      const parentPath = path.dirname(c.path)
      const parent =
        parentPath !== '.'
          ? await pouch.byIdMaybeAsync(metadata.id(parentPath))
          : null
      c.path = normalizedPath(c, parent, normalizedPaths)
      normalizedPaths.push(c.path)
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
  change /*: Change */,
  parent /*: ?Metadata */,
  normalizedPaths /*: string[] */
) /*: string */ => {
  // Curent change's path parts
  const name = path.basename(change.path)
  const parentPath = path.dirname(change.path)

  const normalizedParentPath = parent
    ? parent.path
    : parentPath != '.'
    ? previouslyNormalizedPath(parentPath, normalizedPaths) || parentPath
    : ''
  const { old } = change
  const normalizedName =
    old && isNFD(name) && !isNFD(path.basename(old.path))
      ? name.normalize('NFC')
      : name
  const normalizedPath = path.join(normalizedParentPath, normalizedName)

  if (change.path !== normalizedPath) {
    log.info(
      { path: change.path, normalizedPath },
      'normalizing local path to match existing doc and parent norms'
    )
  }
  return normalizedPath
}

module.exports = {
  step
}
