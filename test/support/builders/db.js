/* @flow */

/** Test data builders common to both CouchDB and PouchDB */

const uuid = require('uuid/v4')

module.exports = {
  id() /*: string */ {
    return uuid().replace(/-/g, '')
  },

  rev(shortRev /*: number */ = 1) /*: string */ {
    return `${shortRev}-${this.id()}`
  }
}
