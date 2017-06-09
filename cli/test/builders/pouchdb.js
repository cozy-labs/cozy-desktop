import uuid from 'node-uuid'

export default {
  id () {
    return uuid.v4().replace(/-/g, '')
  },

  rev () {
    return `1-${this.id()}`
  }
}
