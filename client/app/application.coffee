gui = global.window.nwDispatcher.requireNwGui() or require 'nw.gui'

module.exports =

    initialize: ->

        # if the application is browsed by a guest or not
        # we use that in various places of the application (as few as possible)
        @isPublic = window.location.pathname.indexOf('/public/') is 0

        #Router = require 'router'
        #@router = new Router()

        # Create a node webkit window
        win = gui.Window.get(window.open 'http://cozy.io')
 	      .showDevTools()

        # Create a tray icon
        tray = new gui.Tray({ icon: 'public/assets/icons/main_icon.png' });

        # for easy debugging in browser (and dirty tricks)
        window.app = @

        Backbone.history.start()

        # Makes this object immuable.
        Object.freeze this if typeof Object.freeze is 'function'
