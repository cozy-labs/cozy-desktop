async   = require 'async'
del     = require 'del'
faker   = require 'faker'
fs      = require 'fs-extra'
path    = require 'path'
request = require 'request-json-light'
should  = require 'should'

App = require '../../backend/app'


module.exports = helpers =
    scheme: process.env.SCHEME or 'http'
    host: process.env.HOST or 'localhost'
    port: process.env.PORT or 9104
    password: 'cozytest'
    deviceName: "test-#{faker.internet.userName()}"
    fixturesDir: path.join __dirname, '..', 'fixtures'

helpers.url = "#{helpers.scheme}://#{helpers.host}:#{helpers.port}/"

module.exports.ensurePreConditions = (done) ->
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

module.exports.registerDevice = (done) ->
    parent = process.env.COZY_DESKTOP_DIR or 'tmp'
    @basePath = path.resolve "#{parent}/#{+new Date}"
    fs.ensureDirSync @basePath
    @app = new App @basePath
    @app.askPassword = (callback) ->
        callback null, helpers.password
    @app.addRemote helpers.url, helpers.deviceName, @basePath, (err) ->
        should.not.exist err
        done()

module.exports.clean = (done) ->
    @app.removeRemote helpers.deviceName, (err) =>
        del.sync @basePath
        should.not.exist err
        done()

module.exports.pull = (done) ->
    @app.sync 'pull', (err) ->
        should.not.exist err
    setTimeout done, 1000

module.exports.push = (done) ->
    @app.sync 'push', (err) ->
        should.not.exist err
        done()

module.exports.sync = (done) ->
    @app.sync 'full', (err) ->
        should.not.exist err
        done()
