/** Date/time helpers
 *
 * @module core/utils/timestamp
 * @flow
 */

/*::
export type Timestamp = Date
*/

module.exports = {
  build,
  current,
  fromDate,
  sameDate,
  almostSameDate,
  maxDate,
  stringify
}

function build(
  year /*: number */,
  month /*: number */,
  day /*: number */,
  hour /*: number */,
  minute /*: number */,
  second /*: number */
) /*: Timestamp */ {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second))
}

function current() /*: Timestamp */ {
  return fromDate(new Date())
}

function fromDate(date /*: string|Date|Timestamp */) /*: Timestamp */ {
  let timestamp /*: Date */ = new Date(date)
  timestamp.setMilliseconds(0)
  return timestamp
}

function sameDate(t1 /*: Timestamp */, t2 /*: Timestamp */) /*: boolean */ {
  return t1.getTime() === t2.getTime()
}

// Return true if the two dates are the same, +/- 3 seconds
function almostSameDate(
  one /*: string|Date|Timestamp */,
  two /*: string|Date|Timestamp */
) {
  const oneT = fromDate(one).getTime()
  const twoT = fromDate(two).getTime()
  return Math.abs(twoT - oneT) <= 3000
}

function maxDate(d1 /*: Date */, d2 /*: Date */) /*: Date */ {
  return d1.getTime() > d2.getTime() ? d1 : d2
}

function stringify(t /*: Timestamp */) {
  return t.toISOString().substring(0, 19) + 'Z'
}
