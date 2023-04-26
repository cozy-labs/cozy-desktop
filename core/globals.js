/** Monkey-patches on global objects.
 *
 * @module core/globals
 * @flow
 */

require('../core/utils/modules_stubs').initialize()

require('isomorphic-fetch')

// We are using bluebird instead of native promises:
// - they are easier to debug with long stack traces
// - they have some nice helpers like Promise.delay, map, race, etc.
// - to help transition from callbacks with asCallback and promisifyAll
const Promise = require('bluebird')
global.Promise = Promise
Promise.longStackTraces()

// Network requests can be stuck with Electron on Linux inside the event loop.
// A hack to deblock them is push some events in the event loop.
// See https://github.com/electron/electron/issues/7083#issuecomment-262038387
// And https://github.com/electron/electron/issues/1833
if (process.platform === 'linux' && !process.env.NO_ELECTRON) {
  setInterval(() => {}, 1000)
}
