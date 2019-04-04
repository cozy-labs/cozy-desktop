/* @flow */

const fs = require('fs')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')

const { hideOnWindows } = require('./utils/fs')
const logger = require('./logger')

const log = logger({
  component: 'Config'
})

/*::
export type WatcherType = 'atom' | 'chokidar'
export type SyncMode = 'full' | 'pull' | 'push'
type FileConfig = Object
*/

// Config can keep some configuration parameters in a JSON file,
// like the devices credentials or the mount path
class Config {
  /*::
  configPath: string
  dbPath: string
  fileConfig: FileConfig
  */

  // Create config file if it doesn't exist.
  constructor(basePath /*: string */) {
    this.configPath = path.join(basePath, 'config.json')
    fse.ensureFileSync(this.configPath)
    this.dbPath = path.join(basePath, 'db')
    fse.ensureDirSync(this.dbPath)
    hideOnWindows(basePath)

    this.fileConfig = this.read()
  }

  // Read the configuration from disk
  read() /*: FileConfig */ {
    if (fse.existsSync(this.tmpConfigPath)) {
      const tmpConfig = loadOrDeleteFile(this.tmpConfigPath)

      if (_.size(tmpConfig) > 0) {
        this._moveTmpConfig()
        return tmpConfig
      }
    }

    return loadOrDeleteFile(this.configPath)
  }

  // Reset the configuration
  reset() {
    this.fileConfig = Object.create(null)
    this.clear()
    this.persist()
  }

  // Save configuration to file system.
  persist() {
    this._writeTmpConfig(this.toJSON())
    this._moveTmpConfig()
  }

  _writeTmpConfig(config /*: string */) {
    fse.ensureFileSync(this.tmpConfigPath)
    fse.writeFileSync(this.tmpConfigPath, config)
  }

  _moveTmpConfig() {
    if (fs.copyFileSync && fs.constants.COPYFILE_FICLONE) {
      // Node v8.5.0+ can use a copy-on-write reflink
      fs.copyFileSync(
        this.tmpConfigPath,
        this.configPath,
        fs.constants.COPYFILE_FICLONE
      )
    } else {
      // Fallback for old node versions
      fse.copySync(this.tmpConfigPath, this.configPath)
    }
    fse.unlinkSync(this.tmpConfigPath)
  }

  // Transform the config to a JSON string
  toJSON() /*: string */ {
    return JSON.stringify(this.fileConfig, null, 2)
  }

  // Get the tmp config path associated with the current config path
  get tmpConfigPath() /*: string */ {
    return this.configPath + '.tmp'
  }

  // Get the path on the local file system of the synchronized folder
  get syncPath() /*: string */ {
    return this.fileConfig.path
  }

  // Set the path on the local file system of the synchronized folder
  set syncPath(path /*: string */) {
    this.fileConfig.path = path
  }

  // Return the URL of the cozy instance
  get cozyUrl() /*: string */ {
    return this.fileConfig.url
  }

  // Set the URL of the cozy instance
  set cozyUrl(url /*: string */) {
    this.fileConfig.url = url
  }

  get gui() /*: * */ {
    return this.fileConfig.gui || {}
  }

  // Return true if a device has been configured
  isValid() /*: bool */ {
    return !!(this.fileConfig.creds && this.cozyUrl)
  }

  // Return the name of the registered client
  get deviceName() /*: ?string */ {
    return _.get(this, 'config.creds.client.clientName', '')
  }

  // Return config related to the OAuth client
  get client() /*: * */ {
    if (!this.fileConfig.creds) {
      throw new Error(`Device not configured`)
    }
    return this.fileConfig.creds.client
  }

  get version() /*: ?string */ {
    return _.get(this, 'config.creds.client.softwareVersion')
  }

  get permissions() /*: * */ {
    const scope = _.get(this, 'config.creds.token.scope')
    return scope ? scope.split(' ') : []
  }

  // Set the remote configuration
  set client(options /*: * */) {
    this.fileConfig.creds = { client: options }
    this.persist()
  }

  get watcherType() /*: WatcherType */ {
    return watcherType(this.fileConfig)
  }

  // Set the pull, push or full mode for this device
  // It will throw an exception if the mode is not compatible with the last
  // mode used!
  saveMode(mode /*: SyncMode */) {
    const old = this.fileConfig.mode
    if (old === mode) {
      return true
    } else if (old) {
      throw new Error(
        `Once you set mode to "${old}", you cannot switch to "${mode}"`
      )
    }
    this.fileConfig.mode = mode
    this.persist()
  }

  // Implement the Storage interface for cozy-client-js oauth

  save(key /*: string */, value /*: * */) {
    this.fileConfig[key] = value
    if (key === 'creds') {
      // Persist the access token after it has been refreshed
      this.persist()
    }
    return Promise.resolve(value)
  }

  load(key /*: string */) /*: Promise<*> */ {
    return Promise.resolve(this.fileConfig[key])
  }

  delete(key /*: string */) /*: Promise<*> */ {
    const deleted = delete this.fileConfig[key]
    return Promise.resolve(deleted)
  }

  clear() /*: Promise<void> */ {
    delete this.fileConfig.creds
    delete this.fileConfig.state
    return Promise.resolve()
  }
}

function load(dir /*: string */) /*: Config */ {
  return new Config(dir)
}

/** Load raw config from a JSON file.
 *
 * When file is invalid, delete it and return an empty object.
 */
function loadOrDeleteFile(configPath /*: string */) /*: FileConfig */ {
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

function watcherType(
  fileConfig /*: FileConfig */ = {},
  { env } /*: * */ = process
) /*: WatcherType */ {
  return (
    fileWatcherType(fileConfig) ||
    environmentWatcherType(env) ||
    platformDefaultWatcherType()
  )
}

function fileWatcherType(fileConfig /*: FileConfig */) /*: ?WatcherType */ {
  return validateWatcherType(fileConfig.watcherType)
}

function environmentWatcherType(
  env /*: * */ = process.env
) /*: ?WatcherType */ {
  const { COZY_FS_WATCHER } = env
  return validateWatcherType(COZY_FS_WATCHER)
}

function platformDefaultWatcherType() /*: WatcherType */ {
  return 'atom'
}

function validateWatcherType(watcherType /*: ?string */) /*: ?WatcherType */ {
  if (watcherType === 'atom' || watcherType === 'chokidar') {
    return watcherType
  } else {
    if (watcherType) log.warn({ watcherType }, 'Invalid watcher type')
    return null
  }
}

module.exports = {
  Config,
  environmentWatcherType,
  load,
  loadOrDeleteFile,
  platformDefaultWatcherType,
  watcherType
}
