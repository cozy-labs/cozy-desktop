/**
 * @module core/utils/array
 * @flow
 */

const _ = require('lodash')

/*::
type Direction = 'asc'|'desc'
*/

const sortBy = (
  sortAttr /*: { [string]: Direction } */,
  options /*: ?Object */ = {}
) => {
  return (a /*: Object */, b /*: Object */) /*: number */ => {
    const [attr, direction] = Object.entries(sortAttr)[0]
    const asc = direction === 'asc'

    const attrA = _.get(a, attr)
    const attrB = _.get(b, attr)

    const order =
      typeof attrA === 'string'
        ? attrA.localeCompare(attrB, options)
        : attrA - attrB

    return asc ? order : -order
  }
}

// Use `-` (minus) to sort versions by modification date from the most
// recent to the least recent.
//(a, b) => -a.updated_at.localeCompare(b.updated_at, { numeric: true })

module.exports = {
  sortBy
}
