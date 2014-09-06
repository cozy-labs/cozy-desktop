request = require 'request-json'
log = require('printit')
    prefix: 'Data Proxy | replication'

db = require('./db').db

filters = []

module.exports =

    registerDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        data = login: options.deviceName
        client.post 'device/', data, (err, res, body) ->
            if err
                callback err + body

            else if body.error
                callback new Error body.error

            else
                callback null,
                    id: body.id
                    password: body.password

    unregisterDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        client.del "device/#{options.deviceId}/", (err, res, body) ->
            if err
                callback err + body

            else if body.error
                callback new Error body.error

            else
                callback null

    runReplication: (target) ->

    runSync: (target) ->

