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
  const actionHints = ['moveTo', 'moveFrom', 'overwrite', 'incompatibilities']
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

  src.moveTo = dst.path

  // TODO: Find out wether or not it would make sense to also delete the
  // trashed property on the source, or explain why it doesn't.
  delete dst.trashed

  dst.moveFrom = src
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
  dst /*: Metadata */
) {
  metadata.removeActionHints(src)

  // Create destination
  metadata.markAsUnmerged(dst, side)
  dst._id = src._id
  dst._rev = src._rev
  metadata.markSide(side, dst)
}
