import 'source-map-support/register'

import { start } from 'repl'

import '../globals'
import App from '../app'

const app = new App(process.env.COZY_DESKTOP_DIR)
const config = app.config
let cozy
let ls = () => { console.log('ls() not available') }

console.log(`Welcome to the Cozy Desktop REPL!

The following objects are available:
  app     The cozy-desktop app
  config  Your active cozy-desktop configuration`)

if (config.isValid()) {
  app.instanciate()
  cozy = app.remote.watcher.remoteCozy.client
  ls = async function () {
    const docs = await app.pouch.byRecursivePathAsync('')
    const lines = docs
      .sort((doc1, doc2) => doc1.path.localeCompare(doc2.path))
      .map(doc =>
        `${doc.path}\t\t\t ${JSON.stringify(doc.sides)} \t ${(doc.remote || {})._id}`)

    console.log(`\n\n${lines.join('\n')}\n`)
  }
  console.log(`  cozy    A cozy-client-js instance, set up with your config

Since a valid configuration is available, app.instanciate() was already called
for you, which means you can call app.startSync().`)
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
    if (result instanceof Promise) {
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
  ls
})
