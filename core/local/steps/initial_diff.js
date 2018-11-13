/* @flow */

const { map, merge } = require('rxjs/operators')

module.exports = function ({ initialScan, atomWatcher }) {
  const observable = initialScan.pipe(
    map((x) => [x]) // TODO
  )
  return atomWatcher.pipe(
    merge(observable)
  )
}
