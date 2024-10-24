/** Benchmarking helpers
 *
 * @module core/utils/perfs
 * @flow
 */

const { logger } = require('./logger')
const log = logger({
  component: 'Perfs'
})

module.exports = { measureTime, print }

var store = {}

function ellapsedMillis(startHRTime /*: [number, number] */) {
  const [sec, nano] = process.hrtime(startHRTime)
  return sec * 1000 + nano / 1000000
}

function measureTime(
  key /*: string */,
  print /*: ?boolean */ = !!process.env.PRINT_PERF_MEASURES
) /*: () => void */ {
  if (!process.env.MEASURE_PERF) return () => {}

  store[key] = store[key] || { nb: 0, meanTime: 0 }
  const startTime = process.hrtime()
  return () => {
    const nb = store[key].nb
    const ellapsedTime = ellapsedMillis(startTime)
    store[key].meanTime = (store[key].meanTime * nb + ellapsedTime) / (nb + 1)
    store[key].nb = nb + 1

    if (print) {
      log.trace(`${key} ${nb + 1}: ${ellapsedTime}ms`, {
        function: key
      })
    }
  }
}

function print() {
  for (let key of Object.keys(store)) {
    const { meanTime, nb } = store[key]
    log.trace(`${key} ${nb} * ${meanTime}ms = ${nb * meanTime}ms`, {
      function: key
    })
  }
}

if (process.env.MEASURE_PERF) setInterval(print, 5000)
