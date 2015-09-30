request = require 'request-json-light'
log     = require('printit')
    prefix: 'Device        '


module.exports = device =

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
        client.del "device/#{options.deviceId}/", callback
