// Shorten stacktraces by default.
// Show full stacktraces on CI or when the DEBUG environment variable is set.
if (!process.env.DEBUG && !process.env.CI) {
  require('mocha-clean')
}

// Network requests can be stuck with Electron on Linux inside the event loop.
// A hack to deblock them is push some events in the event loop.
// See https://github.com/electron/electron/issues/7083#issuecomment-262038387
// And https://github.com/electron/electron/issues/1833
if (process.platform === 'linux' && !process.env.NO_ELECTRON) {
  setInterval(() => {}, 1000)
}
