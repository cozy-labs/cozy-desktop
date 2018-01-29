import uuid from 'uuid/v4'

export default {
  id () {
    return uuid().replace(/-/g, '')
  },

  rev () {
    return `1-${this.id()}`
  }
}
