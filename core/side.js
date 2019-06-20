/** Side helpers.
 *
 * @module core/side
 * @flow
 */

/*::
export type SideName =
  | "local"
  | "remote";
*/

const SIDE_NAMES /*: Set<SideName> */ = new Set(['local', 'remote'])

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

module.exports = {
  SIDE_NAMES,
  otherSide
}
