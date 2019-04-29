/* @flow */

require('source-map-support/register')

const { start } = require('repl')

require('../core/globals')
const { App } = require('../core/app')
const TestHelpers = require('../test/support/helpers')

const basePath = process.env.COZY_DESKTOP_DIR
if (basePath == null) throw new Error('COZY_DESKTOP_DIR is undefined')
const app = new App(basePath)
const config = app.config
let cozy, helpers

// eslint-disable-next-line no-console
console.log(`Welcome to the Cozy Desktop REPL!

The following objects are available:
  app      The cozy-desktop app
  config   Your active cozy-desktop configuration`)

if (config.isValid()) {
  app.instanciate()
  cozy = app.remote.watcher.remoteCozy.client
  helpers = TestHelpers.init(app)
  // eslint-disable-next-line no-console
  console.log(`  cozy     A cozy-client-js instance, set up with your config
  helpers  See test/helpers/integration.js

Since a valid configuration is available, app.instanciate() was already called
for you, which means you can call app.startSync().`)
} else {
  // eslint-disable-next-line no-console
  console.log(`
No valid configuration found.
Skipping app instanciation and cozy / helpers setup.`)
}

// eslint-disable-next-line no-console
console.log(`
Press CTRL+D to exit`)

// $FlowFixMe
let repl = start()
const defaultEval = repl.eval

repl.eval = function customEval(cmd, context, filename, callback) {
  defaultEval(cmd, context, filename, (err, result) => {
    if (result instanceof Promise) {
      // eslint-disable-next-line no-console
      result.then(console.log).catch(console.error)
      result = undefined
    }
    callback(err, result)
  })
}

Object.assign(repl.context, {
  app,
  config,
  cozy,
  helpers
})
