path = require 'path-extra'
fs = require 'fs-extra'

defaultDir = path.join path.homedir(), '.cozy-data-proxy'
configPath = path.join defaultDir, './config.json'
fs.ensureFileSync configPath

if fs.readFileSync(configPath).toString() is ''
    fs.writeFileSync configPath, '{}'


module.exports =
    dir: defaultDir
    dbPath: path.join defaultDir, 'db'
    config: require configPath

    addRemoteCozy: (options) ->
        @config.remotes ?= {}
        @config.remotes[options.deviceName] = options
        @saveConfig()

    removeRemoteCozy: (deviceName) ->
        @config.remotes ?= {}
        delete @config.remotes[deviceName]
        @saveConfig()

    saveConfig: ->
        fs.writeFileSync configPath, JSON.stringify @config, null, 2
