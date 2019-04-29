/* @flow */

/** Custom SortedSet implementation
 *
 * We want to be able to reduce a collection while still have the ability to
 * easily delete an element from the collection (i.e. without looking for
 * the element's index first).
 *
 * However:
 * - Sets cannot be reduced
 * - Arrays do not offer the ability to delete an element directly
 *
 * The SortedSet data structure uses both an Array and a Set to make
 * those 2 actions possible transparently.
 */
module.exports = class SortedSet /* ::<A> */ {
  /*::
  _set: Set<A>
  _values: A[]
  */

  constructor() {
    this._set = new Set()
    this._values = []
  }

  has(value /*: A */) {
    return this._set.has(value)
  }

  add(value /*: A */) {
    this._set.add(value)
    this._values.push(value)
    return this
  }

  delete(value /*: A */) {
    if (this._set.delete(value)) {
      const index = this._values.indexOf(value)
      this._values.splice(index, 1)
      return true
    }
    return false
  }

  reduceRight /* ::<B> */(
    callback /*: (B, A) => B */,
    initialValue /*: B */
  ) /*: B */ {
    return this._values.reduceRight(callback, initialValue)
  }
}
