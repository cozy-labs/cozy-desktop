/* @flow */

export type Timestamp = Date

export function InvalidTimestampError (obj: any) {
  this.name = 'InvalidTimestampError'

  this.message = `
    Timestamps must be JavaScript UTC Date instances with second-only precision,
    got: ${JSON.stringify(obj)}`

  // FIXME: Quoting MDN, "[InvalidTimestampError] will report incorrect
  //        lineNumber and fileName at least in Firefox"
  this.stack = (new Error()).stack
}

function valid (obj: any): boolean {
  return (obj instanceof Date) && obj.getMilliseconds() === 0
}

function ensureValid (obj: any): Timestamp {
  if (!valid(obj)) throw new InvalidTimestampError(obj)
  return (obj: Timestamp)
}

function build (year: number, month: number, day: number,
                hour: number, minute: number, second: number): Timestamp {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second))
}

function current (): Timestamp {
  return fromDate(new Date())
}

function fromDate (date: Date): Timestamp {
  let timestamp: Date = new Date(date.getTime())
  timestamp.setMilliseconds(0)
  return timestamp
}

function same (t1: Timestamp, t2: Timestamp): boolean {
  ensureValid(t1)
  ensureValid(t2)

  return t1.getTime() === t2.getTime()
}

// Return true if the two dates are the same, +/- 3 seconds
export function sameDate (one: any, two: any) {
  one = +new Date(one)
  two = +new Date(two)
  return Math.abs(two - one) < 3000
}

export function maxDate (d1: Date, d2: Date): Date {
  return (d1.getTime() > d2.getTime()) ? d1 : d2
}

function stringify (t: Timestamp) {
  ensureValid(t)

  return t.toISOString().substring(0, 19) + 'Z'
}

export default {
  valid,
  ensureValid,
  build,
  current,
  fromDate,
  same,
  stringify
}
