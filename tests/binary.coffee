fs = require 'fs'
touch = require 'touch'

should = require('should')
helpers = require './helpers'
client = helpers.getClient()

config      = require '../backend/config'
replication = require '../backend/replication'
binary      = require '../backend/binary'

describe "Binary Tests", ->

    before helpers.startVagrant
    #before helpers.cleanDB
    after helpers.cleanDB

    params =
        url: 'http://localhost:9104/'

    it "When I move a binary from a DB doc", (done) ->

