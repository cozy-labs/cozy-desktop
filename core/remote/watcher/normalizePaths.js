/* @flow */

const { Promise } = require('bluebird')

const { normalizedPath } = require('../../local/chokidar/normalize_paths')
const { logger } = require('../../utils/logger')

const log = logger({
  component: 'RemoteWatcher/normalize_paths'
})

/*::
import type { Pouch } from '../../pouch'
import type { RemoteChange } from '../change'
import type { SavedMetadata } from '../../metadata'

type NormalizePathsOpts = {
  pouch: Pouch,
}
*/

const normalizePaths = async (
  changes /*: RemoteChange[] */,
  { pouch } /*: NormalizePathsOpts */
) /*: Promise<RemoteChange[]> */ => {
  const normalizedPaths = []

  return new Promise.mapSeries(
    changes,
    async (c /*: RemoteChange */) /*: Promise<RemoteChange> */ => {
      if (
        c.type === 'FileAddition' ||
        c.type === 'DirAddition' ||
        c.type === 'FileUpdate' ||
        c.type === 'DirUpdate' ||
        c.type === 'FileMove' ||
        c.type === 'DirMove' ||
        c.type === 'DescendantChange'
      ) {
        const old /*: ?SavedMetadata */ =
          c.type === 'FileMove' || c.type === 'DirMove'
            ? c.was
            : await pouch.byRemoteIdMaybe(c.doc.remote._id)
        const parent /*: ?SavedMetadata */ = c.doc.remote.dir_id
          ? await pouch.byRemoteIdMaybe(c.doc.remote.dir_id)
          : undefined
        const normalized = normalizedPath(
          c.doc.path,
          old ? old.path : undefined,
          parent,
          normalizedPaths
        )
        normalizedPaths.push(normalized)

        if (c.doc.path !== normalized) {
          log.trace('normalizing path to match existing doc and parent norms', {
            path: normalized,
            oldpath: c.doc.path
          })
          c.doc.path = normalized
        }
      }

      return c
    }
  )
}

module.exports = normalizePaths
