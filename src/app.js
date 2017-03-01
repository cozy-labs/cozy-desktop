/* @flow weak */

// $FlowFixMe
import { Console } from 'console'
import EventEmitter from 'events'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import readdirp from 'readdirp'
import url from 'url'

import pkg from '../package.json'
import Config from './config'
import logger from './logger'
import Pouch from './pouch'
import Ignore from './ignore'
import Merge from './merge'
import Prep from './prep'
import Local from './local'
import Remote from './remote'
import Sync from './sync'
import Registration from './remote/registration'

const log = logger({
  prefix: 'Cozy Desktop  ',
  date: true
})

// App is the entry point for the CLI and GUI.
// They both can do actions and be notified by events via an App instance.
let MAX_LOG_SIZE
class App {
  static initClass () {
    // When a log file weights more than 0.5Mo, rotate it
    MAX_LOG_SIZE = 500000
  }

  lang: string
  basePath: string
  config: Config
  pouch: Pouch
  events: EventEmitter
  logfile: string
  logsInterval: any
  ignore: Ignore
  merge: Merge
  prep: Prep
  local: Local
  remote: Remote
  sync: Sync

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
    logger.console = new Console(out, out)
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

  // Return a promise for registering a device on the remote cozy
  registerRemote (cozyUrl, redirectURI, onRegistered, deviceName) {
    let parsed = this.parseCozyUrl(cozyUrl)
    cozyUrl = url.format(parsed)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      let err = new Error(`Your URL looks invalid: ${cozyUrl}`)
      log.warn(err)
      throw err
    }
    const registration = new Registration(cozyUrl, this.config)
    return registration.process(pkg, redirectURI, onRegistered, deviceName)
  }

  // Save the config with all the informations for synchonization
  saveConfig (cozyUrl, syncPath) {
    fs.ensureDirSync(syncPath)
    this.config.cozyUrl = cozyUrl
    this.config.syncPath = syncPath
    this.config.persist()
    log.info('The remote Cozy has properly been configured ' +
             'to work with current device.')
  }

  // Register current device to remote Cozy and then save related informations
  // to the config file (used by CLI, not GUI)
  async addRemote (cozyUrl, syncPath, deviceName) {
    try {
      const registered = await this.registerRemote(cozyUrl, null, null, deviceName)
      log.info(`Device ${registered.deviceName} has been added to ${cozyUrl}`)
      this.saveConfig(cozyUrl, syncPath)
    } catch (err) {
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
    }
  }

  // Unregister current device from remote Cozy and then remove remote from
  // the config file
  async removeRemote () {
    try {
      if (!this.remote) {
        this.instanciate()
      }
      await this.remote.unregister()
      fs.removeSync(this.basePath)
      log.info('Current device properly removed from remote cozy.')
      return null
    } catch (err) {
      log.error('An error occured while unregistering your device.')
      log.error(err)
      return err
    }
  }

  // Send an issue by mail to the support
  sendMailToSupport (content, callback) {
    // FIXME
    // let conf = this.config.getDevice()
    // let cozyUrl = conf.url
    // let { deviceName } = conf
    // let { passphrase } = conf
    // let mail = {
    //   to: 'log-desktop@cozycloud.cc',
    //   subject: 'Ask support for cozy-desktop',
    //   content
    // }
    // if (this.logfile) {
    //   let attachment = {
    //     content: fs.readFileSync(this.logfile, 'utf-8'),
    //     filename: path.basename(this.logfile),
    //     contentType: 'application/text'
    //   }
    //   mail.attachments = [attachment]
    // }
    // device.sendMailFromUser(cozyUrl, deviceName, passphrase, mail, callback)
  }

  // Load ignore rules
  loadIgnore () {
    let ignored
    try {
      let syncPath = this.config.syncPath
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
  startSync (mode) {
    this.config.saveMode(mode)
    log.info('Run first synchronisation...')
    return this.sync.start(mode)
  }

  // Stop the synchronisation
  stopSync () {
    if (!this.sync) {
      return Promise.resolve()
    }
    return this.sync.stop()
  }

  // Start database sync process and setup file change watcher
  synchronize (mode) {
    if (!this.config.isValid()) {
      log.error('No configuration found, please run add-remote-cozy' +
                'command before running a synchronization.')
      throw new Error('No client configured')
    }
    this.instanciate()
    return this.startSync(mode)
  }

  // Display a list of watchers for debugging purpose
  debugWatchers () {
    if (this.local) {
      this.local.watcher.debug()
    }
  }

  // Call the callback for each file
  walkFiles (args, callback) {
    this.loadIgnore()
    let options = {
      root: this.config.syncPath,
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
  resetDatabase () {
    log.info('Recreates the local database...')
    this.pouch.resetDatabase(function () {
      log.info('Database recreated')
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
