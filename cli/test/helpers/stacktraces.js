// Shorten stacktraces by default.
// Show full stacktraces on CI or when the DEBUG environment variable is set.
if (!process.env.DEBUG && !process.env.CI) {
  require('mocha-clean')
}
