async   = require 'async'
child   = require 'child_process'
fs      = require 'fs-extra'
path    = require 'path'
request = require 'request-json-light'

Couch = require '../../src/remote/couch'


params =
    db:   'cozy'
    user: 'cozyuser'
    pass: 'cozytest'
    port: 5895

url = "http://localhost:#{params.port}"

# We use pouchdb-server as a fake couchdb instance for unit tests
module.exports =

    params: params
    url:    url

    startServer: (done) ->
        client = request.newClient url
        async.waterfall [
            # Start the server
            (next) =>
                bin  = path.resolve "node_modules/.bin/pouchdb-server"
                args = ["-n", "-m", "-p", "#{params.port}"]
                opts = cwd: process.env.COZY_DESKTOP_DIR or '/tmp'
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
            url: url
            deviceName: params.user
            password: params.pass
        events =
            emit: ->
        @couch = new Couch @config, events

    createFolder: (couch, i, callback) ->
        doc =
            _id: Couch.newId()
            path: '/couchdb-folder'
            name: "folder-#{i}"
            docType: 'folder'
            creationDate: new Date()
            lastModification: new Date()
            tags: []
        couch.put doc, callback

    createFile: (couch, i, callback) ->
        doc =
            _id: Couch.newId()
            path: '/couchdb-folder'
            name: "file-#{i}"
            docType: 'file'
            checksum: "111111111111111111111111111111111111112#{i}"
            creationDate: new Date()
            lastModification: new Date()
            tags: []
        couch.put doc, callback
