app = require 'application'

###
Binds routes to code actions.
This is also used as a controller to initialize views and perform data fetching
###
module.exports = class Router extends Backbone.Router

    routes:
        '': 'main'
        'config/:devicename' : 'config'
        'search/:query' : 'search'

    main: ->

    config: (devicename) ->
