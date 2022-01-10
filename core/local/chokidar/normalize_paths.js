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
import type { SavedMetadata } from '../../metadata'
import type { Pouch } from '../../pouch'
import type { LocalChange } from './local_change'

type NormalizePathsOpts = {
  pouch: Pouch,
}
*/

const step = async (
  changes /*: LocalChange[] */,
  { pouch } /*: NormalizePathsOpts */
) /*: Promise<LocalChange[]> */ => {
  const normalizedPaths = []

  return new Promise.mapSeries(
    changes,
    async (c /*: LocalChange */) /*: Promise<LocalChange> */ => {
      if (c.type !== 'Ignored') {
        const parentPath = path.dirname(c.path)
        const parent =
          parentPath !== '.' ? await pouch.bySyncedPath(parentPath) : null
        const normalized = normalizedPath(
          c.path,
          c.old ? c.old.path : undefined,
          parent,
          normalizedPaths
        )
        normalizedPaths.push(normalized)

        if (c.path !== normalized) {
          log.info(
            { path: c.path, normalized },
            'normalizing local path to match existing doc and parent norms'
          )
          c.path = normalized
        }
      }

      return c
    }
  )
}

const previouslyNormalizedPath = (
  docPath /*: string */,
  normalizedPaths /*: string[] */
) /*: ?string */ =>
  normalizedPaths.find(p => p.normalize() === docPath.normalize())

const normalizedPath = (
  newPath /*: string */,
  oldPath /*: ?string */,
  parent /*: ?SavedMetadata */,
  normalizedPaths /*: string[] */
) /*: string */ => {
  // Curent change's path parts
  const name = path.basename(newPath)
  const parentPath = path.dirname(newPath)

  const normalizedParentPath =
    parentPath === '.'
      ? ''
      : !parent
      ? previouslyNormalizedPath(parentPath, normalizedPaths) || parentPath
      : parent.path.normalize() === parentPath.normalize()
      ? parent.path
      : parentPath
  const oldName = oldPath && path.basename(oldPath)

  const normalizedName = !oldName
    ? name
    : oldName.normalize() === name.normalize()
    ? oldName
    : name

  return path.join(normalizedParentPath, normalizedName)
}

module.exports = {
  step,
  normalizedPath
}
