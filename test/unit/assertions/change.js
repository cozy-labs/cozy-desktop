/* eslint-env mocha */

const should = require('should')
const { AssertionError } = should

const noop = () => {}

describe('should(fn).change(obj)', () => {
  it('passes when calling fn adds a property to the object', () => {
    const obj = {foo: 1}
    should(() => { obj.bar = 2 }).change(obj)
  })

  it('fails when no property was changed', () => {
    const obj = {foo: 1}
    should(() => { should(noop).change(obj) }).throw(AssertionError)
    should(() => { should(() => { obj.foo = 1 }).change(obj) }).throw(AssertionError)
  })
})

describe('should(fn).not.change(obj)', () => {
  it('passes when empty object stays the same', () => {
    const obj = {foo: 1}
    should(noop).not.change(obj)
    should(() => { obj.foo = 1 }).not.change(obj)
  })
})

describe('should(() => { ... }).changeOnly(obj, props)', () => {
  it('passes when only the given props were changed to their corresponding values', () => {
    const obj = {foo: 1, bar: 2, baz: 3}
    should(() => {
      obj.foo = 11
      obj.bar = 22
    }).changeOnly(obj, {foo: 11, bar: 22})
  })

  it('fails when another prop was changed', () => {
    const obj = {foo: 1, bar: 2, baz: 3}
    should(() => {
      should(() => {
        obj.foo = 11
        obj.bar = 22
        obj.baz = 33
      }).changeOnly(obj, {foo: 11, bar: 22})
    }).throw(AssertionError)
  })

  it('fails when one of the expected props was not changed', () => {
    const obj = {foo: 1, bar: 2, baz: 3}
    should(() => {
      should(() => {
        obj.foo = 11
      }).changeOnly(obj, {foo: 11, bar: 22})
    }).throw(AssertionError)
  })
})
