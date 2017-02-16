/* eslint-env mocha */

import should from 'should'
import sinon from 'sinon'

import timestamp, { InvalidTimestampError } from '../../src/timestamp'

// XXX: Pass strings to javascript's Date constructor everywhere, so the tests
//      don't depend on the current timezone.

describe('timestamp', () => {
  const nonDate = 123
  const dateWithMilliseconds = new Date(2016, 1, 2, 3, 4, 5, 6, 789)
  const validTimestamp = timestamp.build(2016, 1, 2, 3, 4, 5, 6)

  describe('build', () => {
    it('builds an UTC Date, with month starting from 1 and second-only precision', () => {
      const result = timestamp.build(2016, 11, 22, 9, 54, 37)
      result.should.be.sameTimestamp(new Date('2016-11-22T09:54:37.000Z'))
      result.getMilliseconds().should.equal(0)
    })
  })

  describe('current', () => {
    it('is the timestamp corresponding to the current date/time', () => {
      const now = new Date('2016-11-22T09:54:37.123Z')
      const clock = sinon.useFakeTimers(now.getTime())

      const result = timestamp.current()
      result.should.be.sameTimestamp(new Date('2016-11-22T09:54:37.000Z'))

      clock.restore()
    })
  })

  describe('fromDate', () => {
    it('is the same date without the milliseconds precision', () => {
      const date = new Date('2016-11-22T09:54:37.123Z')
      const result = timestamp.fromDate(date)

      result.should.be.timestamp(2016, 11, 22, 9, 54, 37)
    })
  })

  describe('same', () => {
    it('is true when timestamps have same value', () => {
      should.ok(timestamp.same(
        timestamp.build(2016, 11, 22, 9, 54, 37),
        timestamp.build(2016, 11, 22, 9, 54, 37)
      ))
    })

    it('is false otherwise', () => {
      should.ok(!timestamp.same(
        timestamp.build(2016, 11, 22, 9, 54, 37),
        timestamp.build(2016, 11, 22, 9, 54, 38)
      ))
    })

    it('throws when one or both args are not valid timestamps', () => {
      should.throws(() => {
        timestamp.same(validTimestamp, nonDate)
      }, InvalidTimestampError)

      should.throws(() => {
        timestamp.same(dateWithMilliseconds, nonDate)
      }, InvalidTimestampError)
    })
  })

  describe('stringify', () => {
    it('returns a golang-compatible RFC3339 representation', () => {
      const t = timestamp.build(2017, 2, 16, 8, 59, 18)
      should.equal(timestamp.stringify(t), '2017-02-16T08:59:18Z')
    })

    it('throws when timestamp is not valid', () => {
      should.throws(() => {
        timestamp.stringify(nonDate)
      }, InvalidTimestampError)

      should.throws(() => {
        timestamp.stringify(dateWithMilliseconds)
      }, InvalidTimestampError)
    })
  })
})
