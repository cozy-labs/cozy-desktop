fs         = require 'fs'
request    = require 'request-json-light'
mkdirp     = require 'mkdirp'
touch      = require 'touch'

pouch      = require './db'

Promise    = require 'bluebird'

# Uncomment to properly debug promises
# Promise.longStackTraces()

# Promisify ALL THE THINGS \o
for lib in [fs, request, mkdirp, touch, pouch]
    Promise.promisifyAll lib
