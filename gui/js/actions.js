const { spawn } = require('child_process')
const { app } = require('electron')
const { Promise } = require('bluebird')

const logger = require('../../core/utils/logger')

const log = logger({
  component: 'GUI:actions'
})

async function exit(code /*: number */) {
  app.exit(code)
  // XXX: Exiting is an asynchronous action that cannot be awaited so we give
  // the process 1 second to actually exit.
  await Promise.delay(1000)
}

async function restart() {
  if (process.env.APPIMAGE) {
    return new Promise(resolve => {
      setImmediate(async () => {
        log.info('Exiting old client...')
        await exit(0)
        resolve()
      })
      const args = process.argv.slice(1).filter(a => a !== '--isHidden')
      log.info({ args, cmd: process.argv[0] }, 'Starting new client...')
      spawn(process.argv[0], args, { detached: true })
    })
  } else {
    app.relaunch()
    log.info('Exiting old client...')
    await exit(0)
  }
}

module.exports = {
  exit,
  restart
}
