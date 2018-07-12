/* @flow */

/*::
import type { Metadata } from './metadata'
*/

module.exports = move

// Modify the given src/dst docs so they can be merged then moved accordingly
// during sync.
function move (src /*: Metadata */, dst /*: Metadata */) {
  // moveTo is used for comparison. It's safer to take _id
  // than path for this case, as explained in doc/developer/design.md
  src.moveTo = dst._id
  src._deleted = true

  // Make sure newly moved docs have their fill of sync attempts
  delete src.errors
  delete dst.errors

  // TODO: Find out wether or not it would make sense to also delete the
  // trashed property on the source, or explain why it doesn't.
  delete dst.trashed

  dst.moveFrom = src
}
