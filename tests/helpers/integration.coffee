async   = require 'async'
fs      = require 'fs-extra'
path    = require 'path'
request = require 'request-json-light'
should  = require 'should'


module.exports = helpers =
    scheme: process.env.SCHEME or 'http'
    host: process.env.HOST or 'localhost'
    port: process.env.PORT or 9104
    syncPath: path.resolve '/tmp/cozy/'
    password: 'cozytest'
    deviceName: 'integration-test'

helpers.url = "#{helpers.scheme}://#{helpers.host}:#{helpers.port}/"

helpers.ensurePreConditions = (done) ->
    ports = [5984, 9104, 9101, 9121]
    async.map ports, (port, cb) ->
        client = request.newClient "http://#{helpers.host}:#{port}"
        client.get '/', ((err, res) -> cb null, res?.statusCode), false
    , (err, results) ->
        should.not.exist err
        [couch, proxy, dataSystem, files] = results
        should.exist couch, 'Couch should be running on 5984'
        should.exist proxy, 'Cozy Proxy should be running on 9104'
        should.exist dataSystem, 'Cozy Data System should be running on 9101'
        should.exist files, 'Cozy Files should be running on 9121'
        done()

# Creates a folder
module.exports.prepareFolder = (path) ->
    (done) ->
        fs.ensureDir path, done

# Removes a folder and its content
module.exports.cleanFolder = (path) ->
    (done) ->
        fs.remove path, done
