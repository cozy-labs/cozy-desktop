/**
 * From https://gist.github.com/jvdl/4319e9dc01713015e2ec6c9b9b8afe0c
 *
 * This will prevent specific experimental warnings from being logged
 * to the console. For example if in Node 18 you are using the now native
 * fetch, you will see a warning about it.
 * To suppress this warning:
 *
 * const suppressWarnings = require('...')
 * suppressWarnings.fetch()
 */
const originalEmit = process.emit

module.exports = {
  fetch: function () {
    process.emit = function (name, data) {
      if (
        name === 'warning' &&
        typeof data === 'object' &&
        data.name === 'ExperimentalWarning' &&
        data.message.includes('The Fetch API is an experimental feature')
      ) {
        return false
      }
      return originalEmit.apply(process, arguments)
    }
  }
}
