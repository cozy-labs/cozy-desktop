/** Move reconciliation.
 *
 *     const move = require('.../move')
 *     move(src, dst)
 *     move.child(src, dst)
 *
 * @module core/move
 * @flow
 */

const _ = require('lodash')

const metadata = require('./metadata')
const pathUtils = require('./utils/path')

/*::
import type { Metadata, SavedMetadata } from './metadata'
import type { SideName } from './side'
*/

module.exports = move
move.child = child
move.convertToDestinationAddition = convertToDestinationAddition

// Modify the given src/dst docs so they can be merged then moved accordingly
// during sync.
function move(
  side /*: SideName */,
  src /*: SavedMetadata */,
  dst /*: Metadata */
) {
  // Copy all fields from `src` that are not Sync action hints or PouchDB
  // attributes to `dst` if they're not already defined.
  const pouchdbReserved = ['_id', '_rev', '_deleted']
  const actionHints = ['moveFrom', 'overwrite', 'incompatibilities']
  const fields = Object.getOwnPropertyNames(src).filter(
    f => !pouchdbReserved.concat(actionHints).includes(f)
  )
  for (const field of fields) {
    if (Array.isArray(src[field]) && Array.isArray(dst[field])) {
      dst[field] = _.uniq(_.cloneDeep(src[field]).concat(dst[field]))
    } else if (dst[field] == null) {
      dst[field] = _.cloneDeep(src[field])
    }
  }

  // If the previous move was not applied locally (its `moveFrom` is only
  // cleared on sync success), `src` still carries its own `moveFrom` pointing
  // to the original source path. We chain through it so the destination
  // records the actual local path to move from, not an intermediate path that
  // was never materialized on the filesystem (e.g. a remote move batched with
  // a later move of the same doc, or a move blocked by platform
  // incompatibilities).
  // We don't chain for child moves: their `moveFrom` is the original path
  // before the parent move, which the parent's sync will relocate. Chaining
  // would point at a path the parent move will have already moved away.
  dst.moveFrom =
    src.moveFrom &&
    !src.moveFrom.childMove &&
    !metadata.isAtLeastUpToDate('local', src)
      ? src.moveFrom
      : src
  // TODO: remove `_id` and `_rev` from the exception list above and stop
  // assigning them manually.
  dst._id = src._id
  dst._rev = src._rev

  metadata.markSide(side, dst, src)
}

// Same as move() but mark the source as a child move so it will be moved with
// its ancestor, not by itself, during sync.
function child(
  side /*: SideName */,
  src /*: SavedMetadata */,
  dst /*: Metadata */
) {
  move(side, src, dst)
  src.childMove = true
}

function convertToDestinationAddition(
  side /*: SideName */,
  src /*: SavedMetadata */,
  dst /*: Metadata */,
  { updateSide } /*: { updateSide: boolean } */
) {
  metadata.removeActionHints(src)

  // Create destination
  metadata.markAsUnmerged(dst, side)
  dst._id = src._id
  dst._rev = src._rev
  metadata.markSide(side, dst)

  // Update side path
  if (updateSide && dst[side] != null) {
    if (side === 'local') {
      metadata.updateLocal(dst, { ...dst.local, path: dst.path })
    } else {
      metadata.updateRemote(dst, {
        path: pathUtils.localToRemote(dst.path)
      })
    }
  }
}
