async   = require 'async'
child   = require 'child_process'
fs      = require 'fs-extra'
path    = require 'path'
request = require 'request-json-light'

Couch = require '../../backend/remote/couch'


params =
    db:   'cozy'
    user: 'cozyuser'
    pass: 'cozytest'
    port: 5895

# XXX We use pouchdb-server as a fake couchdb instance for unit tests
module.exports =

    startServer: (done) ->
        client = request.newClient "http://localhost:#{params.port}"
        async.waterfall [
            # Start the server
            (next) =>
                bin  = path.resolve "node_modules/.bin/pouchdb-server"
                args = ["-n", "-m", "-p", "#{params.port}"]
                opts = cwd: process.env.DEFAULT_DIR
                fs.ensureDirSync opts.cwd
                @server = child.spawn bin, args, opts
                setTimeout next, 500

            # Create a user
            (next) ->
                options =
                    _id: "org.couchdb.user:#{params.user}"
                    name: params.user
                    type: "user"
                    roles: []
                    password: params.pass
                async.retry times: 10, interval: 250, (cb) ->
                    client.put "_users/#{params.user}", options, cb
                , (err) -> next err

            # Create a database
            (next) ->
                options =
                    id: params.db
                    name: params.db
                client.put params.db, options, (err) -> next err

            # Add the user to the database admins
            (next) ->
                options =
                    admins:
                        names: [params.user]
                        roles: []
                    users:
                        names: []
                        roles: []
                client.put "#{params.db}/_security", options, (err) -> next err
        ], done

    stopServer: (done) ->
        @server.kill()
        setTimeout done, 100

    createCouchClient: ->
        @config.removeRemoteCozy @config.getDefaultDeviceName()
        @config.addRemoteCozy
            url: "http://localhost:#{params.port}"
            deviceName: params.user
            password: params.pass
        @couch = new Couch @config
