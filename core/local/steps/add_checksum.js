/* @flow */

const { Observable } = require('rxjs')
const { concatMap } = require('rxjs/operators')

module.exports = function (observable) {
  return observable.pipe(
    concatMap((batch) => {
      console.log('checksum', batch)
      return Observable.create(async (observer) => {
        // TODO compute checksum for events that need it
        await Promise.delay(10)
        observer.next(batch)
        observer.complete()
      })
    })
  )
}
