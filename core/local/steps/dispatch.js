/* @flow */

module.exports = function (observable) {
  let subscription = null
  return {
    start: () => {
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
