import 'source-map-support/register'

import read from 'read'
import path from 'path'
import program from 'commander'
import Progress from 'progress'

import pkg from '../../package.json'
import App from '../app'
import logger from '../logger'
let app = new App(process.env.COZY_DESKTOP_DIR)
const log = logger({
  component: 'CLI'
})

let exit = function () {
  log.info('Exiting...')
  setTimeout(process.exit, 3500)
  app.stopSync(() => process.exit())
}

process.on('SIGINT', exit)
process.on('SIGTERM', exit)
process.on('SIGUSR1', () => app.debugWatchers())

// Helper for confirmation
const askConfirmation = (callback) => {
  let promptMsg = 'Are your sure? [Y/N]'
  return read({prompt: promptMsg}, (err, response) => callback(err, response.toUpperCase() === 'Y'))
}

let sync = function (mode, args) {
  log.info(`Cozy-desktop v${pkg.version} started (PID: ${process.pid})`)
  if (!app.config.isValid()) {
    log.info('Your configuration file seems invalid.')
    log.info('Have you added a remote cozy?')
    return process.exit(1)
  }
  app.events.on('transfer-started', (info) => {
    let what = info.way === 'up' ? 'Uploading' : 'Downloading'
    let filename = path.basename(info.path)
    let format = `${what} ${filename} [:bar] :percent :etas`
    if (+info.size > 0) {
      let options = {
        total: Number(info.size),
        width: 30
      }
      let bar = new Progress(format, options)
      app.events.on(info.eventName, function (data) {
        if (data.finished) {
          app.events.removeAllListeners(info.eventName)
        } else {
          bar.tick(data.length)
        }
      })
    } else {
      log.info(`${what} ${filename} (unknown size)`)
    }
  })
  app.synchronize(mode)
    .catch((err) => {
      log.error(err.message)
      process.exit(1)
    })
}

program
  .command('add-remote-cozy <url> <localSyncPath>')
  .description('Configure current device to sync with given cozy')
  .option('-d, --deviceName [deviceName]', 'device name to deal with')
  .action((url, syncPath, args) => {
    const cozyUrl = app.checkCozyUrl(url)
    app.addRemote(cozyUrl, syncPath, args.deviceName)
  })

program
  .command('remove-remote-cozy')
  .description('Unsync current device with its remote cozy')
  .action(() => {
    askConfirmation((err, ok) => {
      if (err || !ok) {
        console.log('Abort!')
        return
      }
      app.removeRemote()
    })
  })

program
  .command('sync')
  .description('Synchronize the local filesystem and the remote cozy')
  .action(function (args) {
    try {
      sync('full', args)
    } catch (err) {
      if (err.message !== 'Incompatible mode') { throw err }
      log.info(`
Full sync from a mount point already used otherwise is not supported

You should create a new mount point and use COZY_DESKTOP_DIR.
The README has more instructions about that.
`
      )
    }
  })

program
  .command('pull')
  .description('Pull files & folders from a remote cozy to local filesystem')
  .action(function (args) {
    try {
      sync('pull', args)
    } catch (err) {
      if (err.message !== 'Incompatible mode') { throw err }
      log.info(`
Pulling from a mount point already used for pushing is not supported

You should create a new mount point and use COZY_DESKTOP_DIR.
The README has more instructions about that.
`
      )
    }
  })

program
  .command('push')
  .description('Push files & folders from local filesystem to the remote cozy')
  .action(function (args) {
    try {
      sync('push', args)
    } catch (err) {
      log.info(`
Pushing from a mount point already used for pulling is not supported

You should create a new mount point and use COZY_DESKTOP_DIR.
The README has more instructions about that.
`
      )
    }
  })

program
  .command('ls')
  .description('List local files that are synchronized with the remote cozy')
  .option('-i, --ignored', 'List ignored files')
  .action(args =>
    app.walkFiles(args, file => console.log(file))
)

program
  .command('reset-database')
  .description('Recreates the local database')
  .action(() => {
    askConfirmation((err, ok) => {
      if (err || !ok) {
        console.log('Abort!')
        return
      }
      app.resetDatabase()
    })
  })

program
  .command('display-database')
  .description('Display database content')
  .action(() => app.allDocs(function (err, results) {
    if (!err) {
      results.rows.forEach(row => {
        console.log(row.doc)
      })
    }
  }))

program
  .command('display-query <query>')
  .description('Display database query result')
  .action(query => app.query(query, function (err, results) {
    if (!err) {
      results.rows.forEach(row => {
        console.log(row.doc)
      })
    }
  }))

program
  .command('display-config')
  .description('Display configuration and exit')
  .action(() => console.log(app.config.toJSON()))

program
  .command('show-disk-space')
  .description('Show disk space usage for the cozy')
  .action(() =>
    app.diskUsage().then(
      (res) => {
        console.log(`Used: ${res.attributes.used / 1000000}MB`)
        if (res.attributes.quota) {
          console.log(`Quota: ${res.attributes.quota / 1000000}MB`)
        }
      },
      (err) => console.log('Error:', err)
    )
  )

program
  .command('*')
  .description('Display help message for an unknown command.')
  .action(() =>
      console.log('Unknown command, run "cozy-desktop --help"' +
        ' to know the list of available commands.')
  )

program
  .version(pkg.version)

program.parse(process.argv)
if (process.argv.length <= 2) {
  program.outputHelp()
}
