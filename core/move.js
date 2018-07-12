/* @flow */

const _ = require('lodash')

/*::
import type { Metadata } from './metadata'
*/

// Export so the following possible is possible:
//
//    const move = require('.../move')
//    move(src, dst)
//    move.child(src, dst)
//
module.exports = move
move.child = child

// Modify the given src/dst docs so they can be merged then moved accordingly
// during sync.
function move (src /*: Metadata */, dst /*: Metadata */) {
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

  dst.moveFrom = _.omit(src, 'moveFrom')
}

// Same as move() but mark the source as a child move so it will be moved with
// its ancestor, not by itself, during sync.
function child (src /*: Metadata */, dst /*: Metadata */) {
  move(src, dst)
  src.childMove = true

  // TODO: Find out why _rev is removed only from child move destinations and
  // explain it here. Or in case it would make sense, move it to the move()
  // function above.
  delete dst._rev
}
