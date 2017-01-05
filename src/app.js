import async from 'async'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import readdirp from 'readdirp'
import url from 'url'
import {
  filteredReplication as filterSDK,
  device
} from 'cozy-device-sdk'
import printit from 'printit'
let log = printit({
  prefix: 'Cozy Desktop  ',
  date: true
})

import { Console } from 'console'
import { EventEmitter } from 'events'

import Config from './config'
import Pouch from './pouch'
import Ignore from './ignore'
import Merge from './merge'
import Prep from './prep'
import Local from './local'
import Remote from './remote'
import Sync from './sync'

let Permissions = {
  'File': {
    'description': 'Useful to synchronize your files'
  },
  'Folder': {
    'description': 'Useful to synchronize your folders'
  },
  'Binary': {
    'description': 'Useful to synchronize the content of your files'
  },
  'send mail from user': {
    'description': 'Useful to send issues by mail to the cozy team'
  }
}

// App is the entry point for the CLI and GUI.
// They both can do actions and be notified by events via an App instance.
let MAX_LOG_SIZE
class App {
  static initClass () {
        // When a log file weights more than 0.5Mo, rotate it
    MAX_LOG_SIZE = 500000
  }

    // basePath is the directory where the config and pouch are saved
  constructor (basePath) {
    this.lang = 'fr'
    if (basePath == null) { basePath = os.homedir() }
    basePath = path.resolve(basePath)
    this.basePath = path.join(basePath, '.cozy-desktop')
    this.config = new Config(this.basePath)
    this.pouch = new Pouch(this.config)
    this.events = new EventEmitter()
  }

    // This method is here to be surcharged by the UI
    // to ask its password to the user
    //
    // callback is a function that takes two parameters: error and password
  askPassword (callback) {
    return callback(new Error('Not implemented'), null)
  }

    // This method is here to be surcharged by the UI
    // to ask for a confirmation before doing something that can't be cancelled
    //
    // callback is a function that takes two parameters: error and a boolean
  askConfirmation (callback) {
    return callback(new Error('Not implemented'), null)
  }

    // Configure a file to write logs to
  writeLogsTo (logfile) {
    this.logfile = logfile
    this.writeToLogfile()
    if (this.logsInterval) { clearInterval(this.logsInterval) }
    this.logsInterval = setInterval(this.rotateLogfile, 10000)
  }

    // Write logs in a file, by overriding the global console
  writeToLogfile () {
    let out = fs.createWriteStream(this.logfile, {flags: 'a+', mode: 0o0644})
    printit.console = new Console(out, out)
  }

    // Rotate the log file if it's too heavy
  rotateLogfile () {
    return fs.stat(this.logfile, (err, stats) => {
      if (err || (stats.size < MAX_LOG_SIZE)) { return }
      return fs.rename(this.logfile, `${this.logfile}.old`, this.writeToLogfile)
    }
        )
  }

    // Parse the URL
  parseCozyUrl (cozyUrl) {
    if (cozyUrl.indexOf(':') === -1) {
      if (cozyUrl.indexOf('.') === -1) {
        cozyUrl += '.cozycloud.cc'
      }
      cozyUrl = `https://${cozyUrl}`
    }
    return url.parse(cozyUrl)
  }

    // Check that the URL belongs to a cozy
  pingCozy (cozyUrl, callback) {
    let parsed = this.parseCozyUrl(cozyUrl)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      let err = new Error('Your URL looks invalid')
      log.warn(err)
      __guardFunc__(callback, f => f(err))
      return
    }
    cozyUrl = url.format(parsed)
    return device.pingCozy(cozyUrl, err => callback(err, cozyUrl))
  }

    // Register a device on the remote cozy
  registerRemote (cozyUrl, deviceName, callback) {
    let parsed = this.parseCozyUrl(cozyUrl)
    cozyUrl = url.format(parsed)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      let err = new Error(`Your URL looks invalid: ${cozyUrl}`)
      log.warn(err)
      callback(err)
      return
    }
    if (deviceName == null) { deviceName = os.hostname() || 'desktop' }
    return this.askPassword(function (_, password) {
      let register = device.registerDeviceSafe
      return register(cozyUrl, deviceName, password, Permissions, function (err, res) {
        if (err) { return callback(err) }
        let config = {file: true};
        ({ deviceName } = res);
        ({ password } = res)
        let setDesignDoc = filterSDK.setDesignDoc.bind(filterSDK)
        return setDesignDoc(cozyUrl, deviceName, password, config, err => callback(err, res))
      })
    })
  }

    // Save the config with all the informations for synchonization
  saveConfig (cozyUrl, syncPath, deviceName, password, callback) {
    return fs.ensureDir(syncPath, err => {
      if (err) {
        return callback(err)
      } else {
        let options = {
          path: path.resolve(syncPath),
          url: cozyUrl,
          deviceName,
          password
        }
        this.config.addRemoteCozy(options)
        log.info('The remote Cozy has properly been configured ' +
                    'to work with current device.'
                )
        return callback(null)
      }
    }
        )
  }

    // Register current device to remote Cozy and then save related informations
    // to the config file (used by CLI, not GUI)
  addRemote (cozyUrl, syncPath, deviceName, callback) {
    return this.registerRemote(cozyUrl, deviceName, (err, credentials) => {
      if (err) {
        log.error('An error occured while registering your device.')
        if (err.code === 'ENOTFOUND') {
          log.warn(`The DNS resolution for ${parsed.hostname} failed.`)
          log.warn('Are you sure the domain is OK?')
        } else if (err === 'Bad credentials') {
          log.warn(err)
          log.warn('Are you sure there are no typo on the password?')
        } else {
          log.error(err)
          if (parsed.protocol === 'http:') {
            log.warn('Did you try with an httpS URL?')
          }
        }
        return __guardFunc__(callback, f => f(err))
      } else {
        ({ deviceName } = credentials)
        let { password } = credentials
        log.info(`Device ${deviceName} has been added to ${cozyUrl}`)
        return this.saveConfig(cozyUrl, syncPath, deviceName, password, err => __guardFunc__(callback, f1 => f1(err, credentials)))
      }
    }
        )
  }

    // Unregister current device from remote Cozy and then remove remote from
    // the config file
  removeRemote (deviceName, callback) {
    if (callback == null) { callback = function () {} }
    let conf = this.config.getDevice()
    let cozyUrl = conf.url
    let { password } = conf
    return device.unregisterDevice(cozyUrl, deviceName, password, err => {
      if (err && (err.message !== 'Request unauthorized')) {
        log.error('An error occured while unregistering your device.')
        log.error(err)
        return callback(err)
      } else {
        log.info('Current device properly removed from remote cozy.')
        return fs.remove(this.basePath, callback)
      }
    }
        )
  }

    // Send an issue by mail to the support
  sendMailToSupport (content, callback) {
    let conf = this.config.getDevice()
    let cozyUrl = conf.url
    let { deviceName } = conf
    let { password } = conf
    let mail = {
      to: 'log-desktop@cozycloud.cc',
      subject: 'Ask support for cozy-desktop',
      content
    }
    if (this.logfile) {
      let attachment = {
        content: fs.readFileSync(this.logfile, 'utf-8'),
        filename: path.basename(this.logfile),
        contentType: 'application/text'
      }
      mail.attachments = [attachment]
    }
    return device.sendMailFromUser(cozyUrl, deviceName, password, mail, callback)
  }

    // Load ignore rules
  loadIgnore () {
    let ignored
    try {
      let syncPath = this.config.getDevice().path
      ignored = fs.readFileSync(path.join(syncPath, '.cozyignore'))
      ignored = ignored.toString().split('\n')
    } catch (error) {
      ignored = []
    }
    this.ignore = new Ignore(ignored).addDefaultRules()
  }

    // Instanciate some objects before sync
  instanciate () {
    this.loadIgnore()
    this.merge = new Merge(this.pouch)
    this.prep = new Prep(this.merge, this.ignore)
    this.local = this.merge.local = new Local(this.config, this.prep, this.pouch, this.events)
    this.remote = this.merge.remote = new Remote(this.config, this.prep, this.pouch, this.events)
    this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
    this.sync.getDiskSpace = this.getDiskSpace
  }

    // Start the synchronization
  startSync (mode, callback) {
    this.config.setMode(mode)
    log.info('Run first synchronisation...')
    return this.sync.start(mode, err => {
      this.sync.stop(function () {})
      if (err) {
        log.error(err)
        if (err.stack) { log.error(err.stack) }
      }
      return __guardFunc__(callback, f => f(err))
    }
        )
  }

    // Stop the synchronisation
  stopSync (callback) {
    if (callback == null) { callback = function () {} }
    if (this.sync) {
      return this.sync.stop(callback)
    } else {
      return callback()
    }
  }

    // Start database sync process and setup file change watcher
  synchronize (mode, callback) {
    let conf = this.config.getDevice()
    if ((conf.deviceName != null) && (conf.url != null) && (conf.path != null)) {
      this.instanciate()
      return this.startSync(mode, callback)
    } else {
      log.error('No configuration found, please run add-remote-cozy' +
                'command before running a synchronization.'
            )
      return __guardFunc__(callback, f => f(new Error('No config')))
    }
  }

    // Display a list of watchers for debugging purpose
  debugWatchers () {
    return __guard__(this.local, x => x.watcher.debug())
  }

    // Call the callback for each file
  walkFiles (args, callback) {
    this.loadIgnore()
    let options = {
      root: this.config.getDevice().path,
      directoryFilter: '!.cozy-desktop',
      entryType: 'both'
    }
    return readdirp(options)
            .on('warn', err => log.warn(err))
            .on('error', err => log.error(err))
            .on('data', data => {
              let doc = {
                _id: data.path,
                docType: data.stat.isFile() ? 'file' : 'folder'
              }
              if (this.ignore.isIgnored(doc) === (args.ignored != null)) {
                return callback(data.path)
              }
            }
        )
  }

    // Recreate the local pouch database
  resetDatabase (callback) {
    return this.askConfirmation((err, ok) => {
      if (err) {
        return log.error(err)
      } else if (ok) {
        log.info('Recreates the local database...')
        return this.pouch.resetDatabase(function () {
          log.info('Database recreated')
          return __guardFunc__(callback, f => f())
        })
      } else {
        return log.info('Abort!')
      }
    }
        )
  }

    // Return the whole content of the database
  allDocs (callback) {
    return this.pouch.db.allDocs({include_docs: true}, callback)
  }

    // Return all docs for a given query
  query (query, callback) {
    return this.pouch.db.query(query, {include_docs: true}, callback)
  }

    // Get disk space informations from the cozy
  getDiskSpace (callback) {
    let conf = this.config.getDevice()
    return device.getDiskSpace(conf.url, conf.deviceName, conf.password, callback)
  }
}
App.initClass()

export default App

function __guardFunc__ (func, transform) {
  return typeof func === 'function' ? transform(func) : undefined
}
function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
