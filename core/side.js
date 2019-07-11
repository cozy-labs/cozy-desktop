/** Side helpers.
 *
 * @module core/side
 * @flow
 */

/*::
import type { SideName } from './metadata'
*/

module.exports = {
  otherSide
}

function otherSide(side /*: SideName */) /*: SideName */ {
  switch (side) {
    case 'local':
      return 'remote'
    case 'remote':
      return 'local'
    default:
      throw new Error(`Invalid side name: ${JSON.stringify(side)}`)
  }
}
