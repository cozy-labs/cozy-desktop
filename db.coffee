PouchDB = require 'pouchdb'
fs = require 'fs-extra'
config = require './config'

fs.ensureDirSync config.dir

module.exports =
    db: new PouchDB config.dbPath
