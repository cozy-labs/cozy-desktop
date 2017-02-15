import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import readdirp from 'readdirp'
import url from 'url'
// TODO: Remove cozy-device-sdk dependency
import { device } from 'cozy-device-sdk'
import fetch from 'node-fetch'
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

// TODO: App.Permissions v3
// eslint-disable-next-line no-unused-vars
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
  constructor (basePath, fetch_ = fetch) {
    this.lang = 'fr'
    if (basePath == null) { basePath = os.homedir() }
    basePath = path.resolve(basePath)
    this.basePath = path.join(basePath, '.cozy-desktop')
    this.config = new Config(this.basePath)
    this.pouch = new Pouch(this.config)
    this.events = new EventEmitter()
    this.fetch = fetch_
  }

  // This method is here to be surcharged by the UI
  // to ask its passphrase to the user
  //
  // callback is a function that takes two parameters: error and passphrase
  askPassword (callback) {
    callback(new Error('Not implemented'), null)
  }

  // This method is here to be surcharged by the UI
  // to ask for a confirmation before doing something that can't be cancelled
  //
  // callback is a function that takes two parameters: error and a boolean
  askConfirmation (callback) {
    callback(new Error('Not implemented'), null)
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
    fs.stat(this.logfile, (err, stats) => {
      if (err || (stats.size < MAX_LOG_SIZE)) { return }
      fs.rename(this.logfile, `${this.logfile}.old`, this.writeToLogfile)
    })
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
  async pingCozy (cozyUrl) {
    let parsed = this.parseCozyUrl(cozyUrl)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      let err = new Error('Your URL looks invalid')
      log.warn(err)
      return Promise.reject(err)
    }
    cozyUrl = url.format(parsed)

    let resp, body
    resp = await this.fetch(cozyUrl + 'status')

    if (resp.status !== 200) {
      throw new Error(`Unexpected response status code: ${resp.status}`)
    }

    body = await resp.json()
    let dumpBody = () => JSON.stringify(body)

    switch (body.message) {
      case 'OK':
        return cozyUrl
      case 'KO':
        throw new Error(`Cozy is KO: ${dumpBody()}`)
      default:
        throw new Error(`Cannot extract message: ${dumpBody()}`)
    }
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
    this.askPassword(function (_, passphrase) {
      // TODO: App.registerRemote() v3
      callback(null, {deviceName, passphrase})
    })
  }

  // Save the config with all the informations for synchonization
  saveConfig (cozyUrl, syncPath, deviceName, passphrase, callback) {
    fs.ensureDir(syncPath, err => {
      if (err) {
        callback(err)
      } else {
        let options = {
          path: path.resolve(syncPath),
          url: cozyUrl,
          deviceName,
          passphrase
        }
        this.config.addRemoteCozy(options)
        log.info('The remote Cozy has properly been configured ' +
                 'to work with current device.')
        callback(null)
      }
    })
  }

  // Register current device to remote Cozy and then save related informations
  // to the config file (used by CLI, not GUI)
  addRemote (cozyUrl, syncPath, deviceName, callback) {
    this.registerRemote(cozyUrl, deviceName, (err, credentials) => {
      if (err) {
        log.error('An error occured while registering your device.')
        let parsed = this.parseCozyUrl(cozyUrl)
        if (err.code === 'ENOTFOUND') {
          log.warn(`The DNS resolution for ${parsed.hostname} failed.`)
          log.warn('Are you sure the domain is OK?')
        } else if (err === 'Bad credentials') {
          log.warn(err)
          log.warn('Are you sure there are no typo on the passphrase?')
        } else {
          log.error(err)
          if (parsed.protocol === 'http:') {
            log.warn('Did you try with an httpS URL?')
          }
        }
        __guardFunc__(callback, f => f(err))
      } else {
        ({ deviceName } = credentials)
        let { passphrase } = credentials
        log.info(`Device ${deviceName} has been added to ${cozyUrl}`)
        this.saveConfig(cozyUrl, syncPath, deviceName, passphrase, err => __guardFunc__(callback, f1 => f1(err, credentials)))
      }
    })
  }

  // Unregister current device from remote Cozy and then remove remote from
  // the config file
  removeRemote (deviceName, callback) {
    if (callback == null) { callback = function () {} }
    let conf = this.config.getDevice()
    let cozyUrl = conf.url
    let { passphrase } = conf
    device.unregisterDevice(cozyUrl, deviceName, passphrase, err => {
      if (err && (err.message !== 'Request unauthorized')) {
        log.error('An error occured while unregistering your device.')
        log.error(err)
        callback(err)
      } else {
        log.info('Current device properly removed from remote cozy.')
        fs.remove(this.basePath, callback)
      }
    })
  }

  // Send an issue by mail to the support
  sendMailToSupport (content, callback) {
    let conf = this.config.getDevice()
    let cozyUrl = conf.url
    let { deviceName } = conf
    let { passphrase } = conf
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
    device.sendMailFromUser(cozyUrl, deviceName, passphrase, mail, callback)
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
    this.remote = this.merge.remote = new Remote(this.config, this.prep, this.pouch)
    this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
    this.sync.getDiskSpace = this.getDiskSpace
  }

  // Start the synchronization
  startSync (mode, callback) {
    this.config.setMode(mode)
    log.info('Run first synchronisation...')
    this.sync.start(mode, err => {
      this.sync.stop(function () {})
      if (err) {
        log.error(err)
        if (err.stack) { log.error(err.stack) }
      }
      __guardFunc__(callback, f => f(err))
    })
  }

  // Stop the synchronisation
  stopSync (callback) {
    if (callback == null) { callback = function () {} }
    if (this.sync) {
      this.sync.stop(callback)
    } else {
      callback()
    }
  }

  // Start database sync process and setup file change watcher
  synchronize (mode, callback) {
    let conf = this.config.getDevice()
    if ((conf.deviceName != null) && (conf.url != null) && (conf.path != null)) {
      this.instanciate()
      this.startSync(mode, callback)
    } else {
      log.error('No configuration found, please run add-remote-cozy' +
                'command before running a synchronization.')
      __guardFunc__(callback, f => f(new Error('No config')))
    }
  }

  // Display a list of watchers for debugging purpose
  debugWatchers () {
    __guard__(this.local, x => x.watcher.debug())
  }

  // Call the callback for each file
  walkFiles (args, callback) {
    this.loadIgnore()
    let options = {
      root: this.config.getDevice().path,
      directoryFilter: '!.cozy-desktop',
      entryType: 'both'
    }
    readdirp(options)
      .on('warn', err => log.warn(err))
      .on('error', err => log.error(err))
      .on('data', data => {
        let doc = {
          _id: data.path,
          docType: data.stat.isFile() ? 'file' : 'folder'
        }
        if (this.ignore.isIgnored(doc) === (args.ignored != null)) {
          callback(data.path)
        }
      })
  }

  // Recreate the local pouch database
  resetDatabase (callback) {
    this.askConfirmation((err, ok) => {
      if (err) {
        log.error(err)
      } else if (ok) {
        log.info('Recreates the local database...')
        this.pouch.resetDatabase(function () {
          log.info('Database recreated')
          __guardFunc__(callback, f => f())
        })
      } else {
        log.info('Abort!')
      }
    })
  }

  // Return the whole content of the database
  allDocs (callback) {
    this.pouch.db.allDocs({include_docs: true}, callback)
  }

  // Return all docs for a given query
  query (query, callback) {
    this.pouch.db.query(query, {include_docs: true}, callback)
  }

  // Get disk space informations from the cozy
  getDiskSpace (callback) {
    // TODO: App.getDiskSpace() v3
    callback(null, {
      diskSpace: {
        usedDiskSpace: 0,
        usedUnit: '',
        freeDiskSpace: 9223372036854776000,
        freeUnit: '',
        totalDiskSpace: 9223372036854776000,
        totalUnit: ''
      }
    })
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
