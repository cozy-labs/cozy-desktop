/**
 * @module core/pouch/error
 * @flow
 * */

/** Represents an Error as returned by Pouch when saving a document
 *
 * Some errors will not be returned as such since they're treated differently by
 * Pouch itself.
 * Examples include:
 * - 'bad_format', thrown when a doc's _rev attribute's format is bad
 */
class PouchError extends Error {
  /*::
  name: string
  status: number
  message: string
  */

  constructor(
    {
      name,
      status,
      message
    } /*:{ name: string, status: number, message: string } */
  ) {
    super()
    this.name = name
    this.status = status
    this.message = message
  }

  toString() {
    return `(${this.status}) ${this.name}: ${this.message}`
  }
}

module.exports = { PouchError }
