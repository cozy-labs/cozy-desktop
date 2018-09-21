const uuid = require('uuid/v4')

module.exports = {
  id () {
    return uuid().replace(/-/g, '')
  },

  rev () {
    return `1-${this.id()}`
  }
}
