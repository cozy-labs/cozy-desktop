/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const {
  almostSameDate,
  build,
  current,
  fromDate,
  maxDate,
  roundedRemoteDate,
  sameDate,
  stringify
} = require('../../../core/utils/timestamp')

describe('timestamp', () => {
  describe('build', () => {
    it('builds an UTC Date, with month starting from 1 and second-only precision', () => {
      const result = build(2016, 11, 22, 9, 54, 37, 0)
      should(result).be.sameTimestamp(new Date('2016-11-22T09:54:37.000Z'))
      should(result.getMilliseconds()).equal(0)
    })
  })

  describe('current', () => {
    it('is the timestamp corresponding to the current date/time', () => {
      const now = new Date('2016-11-22T09:54:37.123Z')
      const clock = sinon.useFakeTimers(now.getTime())

      const result = current()
      should(result).be.sameTimestamp(new Date('2016-11-22T09:54:37.000Z'))

      clock.restore()
    })
  })

  describe('fromDate', () => {
    it('is the same date without the milliseconds precision', () => {
      const date = new Date('2016-11-22T09:54:37.123Z')
      const result = fromDate(date)

      should(result).be.timestamp(2016, 11, 22, 9, 54, 37, 0)
    })
  })

  describe('sameDate', () => {
    it('is true when timestamps have same value', () => {
      should(
        sameDate(
          build(2016, 11, 22, 9, 54, 37, 133),
          build(2016, 11, 22, 9, 54, 37, 133)
        )
      ).be.true()
    })

    it('is false otherwise', () => {
      should(
        sameDate(
          build(2016, 11, 22, 9, 54, 37, 133),
          build(2016, 11, 22, 9, 54, 38, 133)
        )
      ).not.be.true()
    })
  })

  describe('almostSameDate', () => {
    it('returns true if the date are nearly the same', function () {
      let a = '2015-12-01T11:22:56.517Z'
      let b = '2015-12-01T11:22:56.000Z'
      let c = '2015-12-01T11:22:57.000Z'
      let d = '2015-12-01T11:22:59.200Z'
      let e = '2015-12-01T11:22:52.200Z'
      should(almostSameDate(a, b)).be.true()
      should(almostSameDate(a, c)).be.true()
      should(almostSameDate(a, d)).be.true()
      should(almostSameDate(a, e)).be.false()
      should(almostSameDate(b, c)).be.true()
      should(almostSameDate(b, d)).be.true()
      should(almostSameDate(b, e)).be.false()
      should(almostSameDate(c, d)).be.true()
      should(almostSameDate(c, e)).be.false()
      should(almostSameDate(d, e)).be.false()
    })
  })

  describe('maxDate', () => {
    const d1 = new Date('2017-05-18T08:02:36.000Z').toISOString()
    const d2 = new Date('2017-05-18T08:03:16.000Z').toISOString()

    it('finds the most recent of two dates', () => {
      should(maxDate(d1, d2)).deepEqual(d2)
      should(maxDate(d2, d1)).deepEqual(d2)
      should(maxDate(d1, d1)).deepEqual(d1)
    })

    it('increments the most recent date by 1 millisecond if it has more than 3 millisecond digits', function () {
      const d1 = '2015-12-31T23:59:59.999232345Z'
      const d2 = '2015-12-31T23:59:59.999Z'

      should(maxDate(d1, d2)).equal('2016-01-01T00:00:00.000Z')
    })
  })

  describe('stringify', () => {
    it('returns a golang-compatible RFC3339 representation', () => {
      const t = build(2017, 2, 16, 8, 59, 18, 23)
      should(stringify(t)).equal('2017-02-16T08:59:18Z')
    })
  })

  describe('roundedRemoteDate', () => {
    it('adds the milliseconds when they are missing', function () {
      const time = '2015-12-31T23:59:59Z'
      should(roundedRemoteDate(time)).equal('2015-12-31T23:59:59.000Z')
    })

    it('pads the milliseconds with 0s if they have less than 3 digits', function () {
      const a = '2015-12-31T23:59:59.5Z'
      const b = '2015-12-31T23:59:59.54Z'
      should(roundedRemoteDate(a)).equal('2015-12-31T23:59:59.500Z')
      should(roundedRemoteDate(b)).equal('2015-12-31T23:59:59.540Z')
    })

    it('increments the time by 1 millisecond if they have more than 3 digits', function () {
      const time = '2015-12-31T23:59:59.999232345Z'
      should(roundedRemoteDate(time)).equal('2016-01-01T00:00:00.000Z')
    })

    it('handles dates with timezones other than UTC', function () {
      // All previous examples with a different timezone
      const a = '2020-04-05T19:50:06+02:00'
      const b = '2020-04-05T19:50:06.029+02:00'
      const c = '2020-04-05T19:50:06.02+02:00'
      const d = '2020-04-05T19:50:06.229928394+02:00'
      should(roundedRemoteDate(a)).equal('2020-04-05T17:50:06.000Z')
      should(roundedRemoteDate(b)).equal('2020-04-05T17:50:06.029Z')
      should(roundedRemoteDate(c)).equal('2020-04-05T17:50:06.020Z')
      should(roundedRemoteDate(d)).equal('2020-04-05T17:50:06.230Z')
    })
  })
})
