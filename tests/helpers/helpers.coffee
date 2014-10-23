{exec} = require 'child_process'
path = require 'path'
async = require 'async'
should = require 'should'
mkdirp = require 'mkdirp'
Client = require('request-json-light').JsonClient

module.exports = helpers = {}
helpers.options =
    serverScheme: process.env.SCHEME or 'http'
    serverHost: process.env.HOST or 'localhost'
    serverPort: process.env.PORT or 9104
    url: 'http://localhost:9104'
    syncPath: path.resolve '/tmp/cozy/'
    cozyPassword: 'cozytest'

# default client
client = new Client "#{helpers.options.serverScheme}://#{helpers.options.serverHost}:#{helpers.options.serverPort}/"

# Returns a client if url is given, default app client otherwise
helpers.getClient = (url = null) ->
    if url?
        return new Client url
    else
        return client

helpers.ensurePreConditions = (done) ->
    @timeout 5000

    shouldPing = [5984, 9104, 9101, 9121]
    async.map shouldPing, (port, cb) ->
        helpers
            .getClient "http://localhost:#{port}"
            .get '/', ((err, res) -> cb null, res?.statusCode), false

    , (err, results) ->
        [couch, proxy, dataSystem, files] = results
        should.exist couch, 'Couch should be running on 5934'
        should.exist proxy, 'Cozy Proxy should be running on 9104'
        should.exist dataSystem, 'Cozy Data System should be running on 9101'
        should.exist files, 'Cozy Files should be running on 9121'
        done()

# Creates a folder
module.exports.prepareFolder = (path) -> return -> mkdirp.sync path

# Removes a folder and its content
module.exports.cleanFolder = (path) -> (done) ->
    command = "rm -rf #{path}"
    exec command, {}, (err, stderr, stdout) -> done()
