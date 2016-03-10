async   = require 'async'
del     = require 'del'
faker   = require 'faker'
fs      = require 'fs-extra'
path    = require 'path'
request = require 'request-json-light'
should  = require 'should'

App     = require '../../src/app'
PouchDB = require 'pouchdb'


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
    helpers.deviceName = "test-#{faker.internet.userName()}"
    @app.addRemote helpers.url, @basePath, helpers.deviceName, (err) ->
        should.not.exist err
        # For debug:
        # PouchDB.debug.enable 'pouchdb:*'
        done()


module.exports.clean = (done) ->
    # For debug:
    # PouchDB.debug.disable()
    @app.removeRemote helpers.deviceName, (err) =>
        callback = =>
            setTimeout =>
                del.sync @basePath
                done()
            , 200
        should.not.exist err
        if @app.sync
            @app.stopSync (err) ->
                should.not.exist err
                callback()
        else
            callback()


start = (app, mode, done) ->
    app.instanciate() unless app.sync
    app.startSync mode, (err) ->
        should.not.exist err
    setTimeout done, 1500

module.exports.pull = (done) ->
    start @app, 'pull', done

module.exports.push = (done) ->
    start @app, 'push', done

module.exports.sync = (done) ->
    start @app, 'full', done


module.exports.fetchRemoteMetadata = (done) ->
    @app.instanciate() unless @app.sync
    @app.remote.watcher.listenToChanges live: false, (err) ->
        should.not.exist err
        done()
