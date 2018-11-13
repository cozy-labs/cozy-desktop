/* @flow */

const { map, merge } = require('rxjs/operators')

/*::
import type { Observable } from 'rxjs'
*/

module.exports = function ({ initialScan, atomWatcher } /*: * */) /*: Observable<*> */ {
  const observable = initialScan.pipe(
    map((x) => [x]) // TODO
  )
  return atomWatcher.pipe(
    merge(observable)
  )
}
