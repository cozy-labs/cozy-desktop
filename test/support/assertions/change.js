const _ = require('lodash')
const should = require('should')

function changeAssertion (strict) {
  const assertionName = strict ? 'changeOnly' : 'change'

  const assertion = function (actual, props) {
    if (props) {
      if (this.negate) {
        throw new Error(
          `should(...).not.${assertionName}(..., props) is not supported`
        )
      }
      if (!_.isPlainObject(props)) {
        throw new Error(
          `should(...).${assertionName}(..., props) must be an object`
        )
      }
    }
    if (strict) {
      if (this.negate) {
        throw new Error(
          `should(...).not.${assertionName}(...) is not supported`
        )
      }
      if (props == null) {
        throw new Error(
          `should(...).${assertionName}(..., props) is required`
        )
      }
    }

    const original = _.clone(actual)
    const codeWithPossibleSideEffect = this.obj

    codeWithPossibleSideEffect()

    this.params = {actual, operator: 'to have changed'}

    if (props) {
      const expected = _.defaults({}, props, strict ? original : actual)
      should(actual).deepEqual(expected)
    } if (_.isEqual(actual, original)) {
      if (!this.negate) {
        this.params.operator += ' but it is the same'
        this.fail()
      }
    } else if (this.negate) {
      this.params.operator += ' from original'
      this.params.expected = original
      this.fail()
    }
  }

  assertion.name = assertionName
  return assertion
}

should.Assertion.prototype.change = changeAssertion(false)
should.Assertion.prototype.changeOnly = changeAssertion(true)
