/* @flow */

/*::
import type { Observable } from 'rxjs'

export interface Runner {
  start(): Promise<*>,
  stop(): *,
}
*/

module.exports = function (observable /*: Observable<*> */) /*: Runner */ {
  let subscription = null
  return {
    start: async () => {
      subscription = observable.subscribe(x => console.log(x))
    },
    stop: () => {
      if (subscription) {
        subscription.unsubscribe()
        subscription = null
      }
    }
  }
}
