path = require 'path'
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

