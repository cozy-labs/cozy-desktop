/* @flow */

import logger from './logger'
const log = logger({
  component: 'PerfReports'
})

var store = {}

function ellapsedMillis (startHRTime: [number, number]) {
  const [sec, nano] = process.hrtime(startHRTime)
  return (sec * 1000) + (nano / 1000000)
}

export default function measureTime (key: string): () => void {
  if (!process.env.MEASURE_PERF) return () => {}
  store[key] = store[key] || {nb: 0, time: 0}
  const startTime = process.hrtime()
  return () => {
    const nb = store[key].nb
    store[key].time = (store[key].time * nb + ellapsedMillis(startTime)) / (nb + 1)
    store[key].nb = nb + 1
  }
}

export function wrapCallback (key: string, originalCb: () => mixed) {
  const stopMeasure = measureTime(key)
  return function newCallback (...args: Array<any>) {
    stopMeasure()
    originalCb.apply(this, args)
  }
}

function print () {
  for (let key of Object.keys(store)) {
    const {time, nb} = store[key]
    log.trace({function: key}, key + ' ' + nb + ' * ' + time + ' = ' + nb * time)
  }
}

if (process.env.MEASURE_PERF) setInterval(print, 5000)
