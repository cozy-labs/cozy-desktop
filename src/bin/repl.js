import { start } from 'repl'

import App from '../app'

const app = new App(process.env.COZY_DESKTOP_DIR)
const config = app.config.getDevice()
let cozy

console.log(`Welcome to the Cozy Desktop REPL!

The following objects are available:
  app     The cozy-desktop app
  config  Your active cozy-desktop configuration`)

if ((config.deviceName != null) && (config.url != null) && (config.path != null)) {
  app.instanciate()
  cozy = app.remote.watcher.remoteCozy.client
  console.log(`  cozy    A cozy-client-js instance, set up with your config

Since a valid configuration is available, app.instanciate() was already called
for you.`)
} else {
  console.log(`
No valid configuration found.
Skipping app instanciation and cozy-client-js setup.`)
}

console.log(`
Press CTRL+D to exit`)

let repl = start()
const defaultEval = repl.eval

repl.eval = function customEval (cmd, context, filename, callback) {
  defaultEval(cmd, context, filename, (err, result) => {
    if (result instanceof Promise) result.then(console.log).catch(console.error)
    callback(err, result)
  })
}

Object.assign(repl.context, {
  app,
  config,
  cozy
})

