/** Move reconciliation.
 *
 *     const move = require('.../move')
 *     move(src, dst)
 *     move.child(src, dst)
 *
 * @module core/move
 * @flow
 */

const metadata = require('./metadata')

/*::
import type { SideName, Metadata } from './metadata'
*/

module.exports = move
move.child = child

// Modify the given src/dst docs so they can be merged then moved accordingly
// during sync.
function move(side /*: SideName */, src /*: Metadata */, dst /*: Metadata */) {
  // moveTo is used for comparison. It's safer to take _id
  // than path for this case, as explained in doc/developer/design.md
  src.moveTo = dst._id
  src._deleted = true

  delete src.errors

  // Make sure newly moved docs have their fill of sync attempts
  delete dst.errors

  // TODO: Find out wether or not it would make sense to also delete the
  // trashed property on the source, or explain why it doesn't.
  delete dst.trashed

  dst.moveFrom = src

  if (!dst.overwrite) {
    delete dst._rev
  }
  delete dst.sides
  metadata.markSide(side, dst)
}

// Same as move() but mark the source as a child move so it will be moved with
// its ancestor, not by itself, during sync.
function child(side /*: SideName */, src /*: Metadata */, dst /*: Metadata */) {
  src.childMove = true
  move(side, src, dst)
}
