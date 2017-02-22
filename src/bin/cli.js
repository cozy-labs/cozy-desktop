import 'source-map-support/register'
import '../globals'

import read from 'read'
import path from 'path'
import program from 'commander'
import Progress from 'progress'

import pkg from '../../package.json'
import App from '../app'
let app = new App(process.env.COZY_DESKTOP_DIR)
let log = global.console

let exit = function () {
  log.log('Exiting...')
  setTimeout(process.exit, 3500)
  return app.stopSync(() => process.exit())
}

process.on('SIGINT', exit)
process.on('SIGTERM', exit)
process.on('SIGUSR1', () => app.debugWatchers())

// Helper for confirmation
app.askConfirmation = function (callback) {
  let promptMsg = 'Are your sure? [Y/N]'
  return read({prompt: promptMsg}, (err, response) => callback(err, response.toUpperCase() === 'Y'))
}

let sync = function (mode, args) {
  log.log(`Cozy-desktop v${pkg.version} started (PID: ${process.pid})`)
  if (args.logfile != null) {
    app.writeLogsTo(args.logfile)
  }
  if (!app.config.isValid()) {
    log.log('Your configuration file seems invalid.')
    log.log('Have you added a remote cozy?')
    return process.exit(1)
  }
  app.events.on('up-to-date', () => log.log('Your cozy is up to date!'))
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
      return app.events.on(info.eventName, function (data) {
        if (data.finished) {
          return app.events.removeAllListeners(info.eventName)
        } else {
          return bar.tick(data.length)
        }
      })
    } else {
      return log.log(`${what} ${filename} (unknown size)`)
    }
  })
  return app.synchronize(mode, (err) => {
    if (err) { return process.exit(1) }
  })
}

program
  .command('add-remote-cozy <url> <localSyncPath>')
  .description('Configure current device to sync with given cozy')
  .option('-d, --deviceName [deviceName]', 'device name to deal with')
  .action((url, syncPath, args) => app.addRemote(url, syncPath, pkg, args.deviceName))

program
  .command('remove-remote-cozy')
  .description('Unsync current device with its remote cozy')
  .option('-d, --deviceName [deviceName]', 'device name to deal with')
  .action(args => app.removeRemote(args.deviceName))

program
  .command('sync')
  .description('Synchronize the local filesystem and the remote cozy')
  .option('-l, --logfile [logfile]', 'Write logs to this file')
  .action(function (args) {
    try {
      return sync('full', args)
    } catch (err) {
      if (err.message !== 'Incompatible mode') { throw err }
      return log.log(`
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
  .option('-l, --logfile [logfile]', 'Write logs to this file')
  .action(function (args) {
    try {
      return sync('pull', args)
    } catch (err) {
      if (err.message !== 'Incompatible mode') { throw err }
      return log.log(`
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
  .option('-l, --logfile [logfile]', 'Write logs to this file')
  .action(function (args) {
    try {
      return sync('push', args)
    } catch (err) {
      return log.log(`
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
    app.walkFiles(args, file => log.log(file))
)

program
  .command('reset-database')
  .description('Recreates the local database')
  .action(app.resetDatabase)

program
  .command('display-database')
  .description('Display database content')
  .action(() => app.allDocs(function (err, results) {
    if (!err) {
      results.rows.forEach(row => {
        log.log(row.doc)
      })
    }
  }))

program
  .command('display-query <query>')
  .description('Display database query result')
  .action(query => app.query(query, function (err, results) {
    if (!err) {
      results.rows.forEach(row => {
        log.log(row.doc)
      })
    }
  }))

program
  .command('display-config')
  .description('Display configuration and exit')
  .action(() => log.log(app.config.toJSON()))

program
  .command('show-disk-space')
  .description('Show disk space usage for the cozy')
  .action(() =>
    app.getDiskSpace(function (err, res) {
      if (err) {
        return console.log('Error:', err)
      } else {
        let space = res.diskSpace
        console.log(`Used:  ${space.usedDiskSpace} ${space.usedUnit}b`)
        console.log(`Free:  ${space.freeDiskSpace} ${space.freeUnit}b`)
        return console.log(`Total: ${space.totalDiskSpace} ${space.totalUnit}b`)
      }
    })
  )

program
  .command('*')
  .description('Display help message for an unknown command.')
  .action(() =>
      log.log('Unknown command, run "cozy-desktop --help"' +
               ' to know the list of available commands.')
  )

program
  .version(pkg.version)

program.parse(process.argv)
if (process.argv.length <= 2) {
  program.outputHelp()
}
