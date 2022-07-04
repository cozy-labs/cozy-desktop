/** The synchronization client configuration
 *
 * @module core/config
 * @flow
 */

const fs = require('fs')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')

const { hideOnWindows } = require('./utils/fs')
const logger = require('./utils/logger')

const log = logger({
  component: 'Config'
})

/*::
export type WatcherType = 'channel' | 'chokidar'
type FileConfig = Object
type OAuthTokens = {
  tokenType: string,
  accessToken: string,
  refreshToken: string,
  scope: string,
}
type OAuthClient = {
  clientID: string,
  clientSecret: string,
  registrationAccessToken: string,
  redirectURI: string,
  softwareID: string,
  softwareVersion: string,
  clientName: string,
  clientKind: string,
  clientURI: string,
  logoURI: string,
  policyURI: string,
  notificationPlatform: string,
  notificationDeviceToken: string,
}
*/

/* Stat dates on Windows were previously truncated to the second while we now
 * get the milliseconds as well.
 * To avoid re-calculating all the local checksums during the initial scan
 * because of the date migration, we'll truncate `scan` events dates to the
 * second during the first initial scan following the publication of v3.28.1
 * when checking if the checksum of a given file can be reused or not.
 *
 * When publishing v3.28.2 or greater, we can remove WINDOWS_DATE_MIGRATION_FLAG
 * and stop truncating dates during the initial scan.
 *
 * Users who will have skipped the version introducing the flag will see all
 * their checksums re-computed.
 */
const WINDOWS_DATE_MIGRATION_APP_VERSION = '3.28.1'
const WINDOWS_DATE_MIGRATION_FLAG = 'roundWindowsDatesToSecondInInitialDiff'

const INVALID_CONFIG_ERROR = 'InvalidConfigError'
const INVALID_CONFIG_MESSAGE = 'Invalid client configuration'
class InvalidConfigError extends Error {
  constructor() {
    super(INVALID_CONFIG_MESSAGE)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidConfigError)
    }

    this.name = INVALID_CONFIG_ERROR
  }
}

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
      fs.copyFileSync(this.tmpConfigPath, this.configPath)
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

  // Return config related to the OAuth client
  get client() /*: OAuthClient */ {
    if (!this.fileConfig.creds) {
      throw new Error(`Device not configured`)
    }
    return this.fileConfig.creds.client
  }

  // Set the remote configuration
  set client(options /*: OAuthClient */) {
    this.fileConfig.creds = { client: options }
    this.persist()
  }

  get version() /*: ?string */ {
    return _.get(this.fileConfig, 'creds.client.softwareVersion', '')
  }

  set version(newVersion /*: string */) /*: * */ {
    _.set(this.fileConfig, 'creds.client.softwareVersion', newVersion)
    this.persist()
  }

  get permissions() /*: string[] */ {
    const scope = _.get(this.fileConfig, 'creds.token.scope', '')
    return scope ? scope.split(' ') : []
  }

  // Return the id of the registered OAuth client
  get deviceId() /*: ?string */ {
    return _.get(this.fileConfig, 'creds.client.clientID', '')
  }

  // Return the name of the registered OAuth client
  get deviceName() /*: ?string */ {
    return _.get(this.fileConfig, 'creds.client.clientName', '')
  }

  get oauthTokens() /*: OAuthTokens */ {
    if (!this.fileConfig.creds) {
      throw new Error(`Device not configured`)
    }
    return this.fileConfig.creds.token
  }

  // Flags are options that can be activated by the user via the config file.
  // They can be used to activate incomplete features for example.
  get flags() /*: { [string]: boolean } */ {
    return _.get(this.fileConfig, 'flags', {})
  }

  isFlagActive(flagName /*: string */) /*: boolean */ {
    return this.flags[flagName] || false
  }

  setFlag(flag /*: string */, isActive /*: boolean */) {
    if (
      typeof flag !== 'string' ||
      typeof isActive !== 'boolean' ||
      flag === ''
    ) {
      throw new Error(
        `Invalid flag or value: [String(${flag})] → "${String(isActive)}"`
      )
    }
    _.set(this.fileConfig, `flags.${flag}`, isActive)
    this.persist()
  }

  get watcherType() /*: WatcherType */ {
    return watcherType(this.fileConfig)
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
      log.error({ err: e }, `Could not read config file at ${configPath}`)
      fse.unlinkSync(configPath)
      return {}
    } else {
      throw e
    }
  }
}

/** Detect which local watcher will be used. */
function watcherType(
  fileConfig /*: FileConfig */ = {},
  { env, platform } /*: * */ = process
) /*: WatcherType */ {
  return (
    fileWatcherType(fileConfig) ||
    environmentWatcherType(env) ||
    platformDefaultWatcherType(platform)
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

function platformDefaultWatcherType(
  platform /*: string */ = process.platform
) /*: WatcherType */ {
  if (platform === 'darwin') {
    return 'chokidar'
  }
  return 'channel'
}

function validateWatcherType(watcherType /*: ?string */) /*: ?WatcherType */ {
  if (watcherType === 'channel' || watcherType === 'chokidar') {
    return watcherType
  } else {
    if (watcherType) log.warn({ watcherType }, 'Invalid watcher type')
    return null
  }
}

module.exports = {
  INVALID_CONFIG_ERROR,
  WINDOWS_DATE_MIGRATION_APP_VERSION,
  WINDOWS_DATE_MIGRATION_FLAG,
  InvalidConfigError,
  Config,
  environmentWatcherType,
  load,
  loadOrDeleteFile,
  platformDefaultWatcherType,
  watcherType
}
