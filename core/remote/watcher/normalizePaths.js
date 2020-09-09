/* @flow */

const path = require('path')
const { Promise } = require('bluebird')

const metadata = require('../../metadata')
const { normalizedPath } = require('../../local/chokidar/normalize_paths')
const logger = require('../../utils/logger')

const log = logger({
  component: 'RemoteWatcher/normalize_paths'
})

/*::
import type { Pouch } from '../../pouch'
import type { RemoteChange } from '../change'
import type { Metadata } from '../../metadata'

type NormalizePathsOpts = {
  pouch: Pouch,
}
*/

const normalizePaths = async (
  changes /*: RemoteChange[] */,
  { pouch } /*: NormalizePathsOpts */
) /*: Promise<RemoteChange[]> */ => {
  const normalizedPaths = []

  return new Promise.mapSeries(changes, async (
    c /*: RemoteChange */
  ) /*: Promise<RemoteChange> */ => {
    if (
      c.type === 'FileAddition' ||
      c.type === 'DirAddition' ||
      c.type === 'FileUpdate' ||
      c.type === 'FileMove' ||
      c.type === 'DirMove' ||
      c.type === 'DescendantChange'
    ) {
      const old =
        c.type === 'FileMove' || c.type === 'DirMove'
          ? c.was
          : await pouch.byIdMaybeAsync(c.doc._id)
      const parentPath = path.dirname(c.doc.path)
      const parent =
        parentPath !== '.'
          ? await pouch.byIdMaybeAsync(metadata.id(parentPath))
          : null
      c.doc.path = normalizedPath(
        c.doc.path,
        old && old.path,
        parent,
        normalizedPaths
      )
      normalizedPaths.push(c.doc.path)

      if (c.doc.path !== normalizedPath) {
        log.info(
          { path: c.doc.path, normalizedPath },
          'normalizing local path to match existing doc and parent norms'
        )
      }
    }

    return c
  })
}

module.exports = normalizePaths
