path = require 'path-extra'

homedir = path.homedir()
configDir = path.join homedir, '.cozy-data-proxy'
configPath = path.join configDir, 'config.json'
config = require configPath

device = {}
keys = Object.keys config.devices
device = config.devices[keys[0]] if keys.length > 0
