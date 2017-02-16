import should from 'should'

import timestamp from '../../src/timestamp'

should.use(function (should, Assertion) {
  Assertion.add('sameTimestamp', function (expected, message) {
    this.params = {
      operator: 'be the same timestamp as',
      expected,
      message
    }

    this.obj.getTime().should.equal(expected.getTime())
  })

  Assertion.add('timestamp', function (...args) {
    const expected = timestamp.build(...args)

    this.params = {
      operator: 'be a timestamp',
      expected
    }

    this.obj.should.be.sameTimestamp(expected)
  })
})
