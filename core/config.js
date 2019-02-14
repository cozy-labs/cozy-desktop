const fs = require('fs')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')

const { hideOnWindows } = require('./utils/fs')
const logger = require('./logger')

const log = logger({
  component: 'Config'
})

// Config can keep some configuration parameters in a JSON file,
// like the devices credentials or the mount path
class Config {
  // Create config file if it doesn't exist.
  constructor (basePath) {
    this.configPath = path.join(basePath, 'config.json')
    fse.ensureFileSync(this.configPath)
    this.dbPath = path.join(basePath, 'db')
    fse.ensureDirSync(this.dbPath)
    hideOnWindows(basePath)

    this.config = this.read()
  }

  // Load a config JSON file or return an empty object
  static safeLoad (configPath) {
    try {
      const content = fs.readFileSync(configPath, 'utf8')
      if (content === '') return {}
      return JSON.parse(content)
    } catch (e) {
      if (e instanceof SyntaxError) {
        log.error(`Could not read config file at ${configPath}:`, e)
        fse.unlinkSync(configPath)
        return {}
      } else {
        throw e
      }
    }
  }

  // Read the configuration from disk
  read () {
    if (fse.existsSync(this.tmpConfigPath)) {
      const tmpConfig = Config.safeLoad(this.tmpConfigPath)

      if (_.size(tmpConfig) > 0) {
        this._moveTmpConfig()
        return tmpConfig
      }
    }

    return Config.safeLoad(this.configPath)
  }

  // Reset the configuration
  reset () {
    this.config = Object.create(null)
    this.clear()
    this.persist()
  }

  // Save configuration to file system.
  persist () {
    this._writeTmpConfig(this.toJSON())
    this._moveTmpConfig()
  }

  _writeTmpConfig (config) {
    fse.ensureFileSync(this.tmpConfigPath)
    fse.writeFileSync(this.tmpConfigPath, config)
  }

  _moveTmpConfig () {
    if (fs.copyFileSync && fs.constants.COPYFILE_FICLONE) {
      // Node v8.5.0+ can use a copy-on-write reflink
      fs.copyFileSync(this.tmpConfigPath, this.configPath, fs.constants.COPYFILE_FICLONE)
    } else {
      // Fallback for old node versions
      fse.copySync(this.tmpConfigPath, this.configPath)
    }
    fse.unlinkSync(this.tmpConfigPath)
  }

  // Transform the config to a JSON string
  toJSON () {
    return JSON.stringify(this.config, null, 2)
  }

  // Get the tmp config path associated with the current config path
  get tmpConfigPath () {
    return this.configPath + '.tmp'
  }

  // Get the path on the local file system of the synchronized folder
  get syncPath () {
    return this.config.path
  }

  // Set the path on the local file system of the synchronized folder
  set syncPath (path) {
    this.config.path = path
  }

  // Return the URL of the cozy instance
  get cozyUrl () {
    return this.config.url
  }

  // Set the URL of the cozy instance
  set cozyUrl (url) {
    this.config.url = url
  }

  get gui () {
    return this.config.gui || {}
  }

  // Return true if a device has been configured
  isValid () {
    return !!(this.config.creds && this.cozyUrl)
  }

  // Return the name of the registered client
  get deviceName () {
    return _.get(this, 'config.creds.client.clientName', '')
  }

  // Return config related to the OAuth client
  get client () {
    if (!this.config.creds) {
      throw new Error(`Device not configured`)
    }
    return this.config.creds.client
  }

  get version () {
    return _.get(this, 'config.creds.client.softwareVersion')
  }

  get permissions () {
    const scope = _.get(this, 'config.creds.token.scope')
    return scope ? scope.split(' ') : []
  }

  // Set the remote configuration
  set client (options) {
    this.config.creds = { client: options }
    this.persist()
  }

  get watcherType () {
    if (!this.config.watcherType) {
      this.config.watcherType = watcherType(this.config)
    }
    return this.config.watcherType
  }

  // Set the pull, push or full mode for this device
  // It will throw an exception if the mode is not compatible with the last
  // mode used!
  saveMode (mode) {
    const old = this.config.mode
    if (old === mode) {
      return true
    } else if (old) {
      throw new Error(`Once you set mode to "${old}", you cannot switch to "${mode}"`)
    }
    this.config.mode = mode
    this.persist()
  }

  // Implement the Storage interface for cozy-client-js oauth

  save (key, value) {
    this.config[key] = value
    if (key === 'creds') {
      // Persist the access token after it has been refreshed
      this.persist()
    }
    return Promise.resolve(value)
  }

  load (key) {
    return Promise.resolve(this.config[key])
  }

  delete (key) {
    const deleted = delete this.config[key]
    return Promise.resolve(deleted)
  }

  clear () {
    delete this.config.creds
    delete this.config.state
    return Promise.resolve()
  }
}

function load (dir /*: string */) /*: Config */ {
  return new Config(dir)
}

function watcherType (config = {}, {env, platform} = process) {
  return (
    config.watcherType ||
    userDefinedWatcherType(process.env) ||
    platformDefaultWatcherType(process.platform)
  )
}

function userDefinedWatcherType (env) /*: WatcherType | null */ {
  const { COZY_FS_WATCHER } = env
  if (COZY_FS_WATCHER === 'atom') {
    return 'atom'
  } else if (COZY_FS_WATCHER === 'chokidar') {
    return 'chokidar'
  }
  return null
}

function platformDefaultWatcherType (platform /*: string */) /*: WatcherType */ {
  if (platform === 'darwin') {
    return 'chokidar'
  }
  return 'chokidar' // XXX: Should be 'atom' once we go live with the new watcher
}

module.exports = {
  Config,
  load,
  watcherType
}
