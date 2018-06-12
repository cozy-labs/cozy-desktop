/* @flow */

export type Delay = number

module.exports = {
  days,
  hours,
  minutes,
  seconds
}

function days (count: number): Delay {
  return count * this.hours(24)
}

function hours (count: number): Delay {
  return count * this.minutes(60)
}

function minutes (count: number): Delay {
  return count * this.seconds(60)
}

function seconds (count: number): Delay {
  return count * 1000
}
