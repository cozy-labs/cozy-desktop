request = require 'request-json-light'
log     = require('printit')
    prefix: 'Devices       '


module.exports =

    # Pings the cozy to check the credentials without creating a device
    checkCredentials: (options, callback) ->
        client = request.newClient options.url
        data =
            username: 'owner'
            password: options.password
        client.post "login", data, (err, res, body) ->
            if res?.statusCode isnt 200
                err = err?.message or body.error or body.message
            callback err


    # Register device remotely then returns credentials given by remote Cozy.
    # This credentials will allow the device to access to the Cozy database.
    registerDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        data =
            login: options.deviceName
        client.post 'device/', data, (err, res, body) ->
            if err
                callback err
            else if body.error?
                if body.error is 'string'
                    log.error body.error
                callback body.error
            else
                callback null,
                    id: body.id
                    password: body.password


    # Unregister device remotely, ask for revocation.
    unregisterDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password
        client.del "device/#{options.deviceName}/", (err, res, body) ->
            if res.statusCode in [200, 204]
                callback null
            else if err
                callback err
            else if body.error?
                callback new Error body.error
            else
                callback new Error "Something went wrong (#{res.statusCode})"


    # Get useful information about the disk space
    # (total, used and left) on the remote Cozy
    getDiskSpace: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth options.deviceName, options.password

        client.get "disk-space", (err, res, body) ->
            if err
                callback err
            else if body.error
                callback new Error body.error
            else
                callback null, body
