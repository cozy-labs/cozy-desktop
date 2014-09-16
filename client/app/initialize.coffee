{div} = React.DOM

# Waits for the DOM to be ready
window.onload = ->

    window.__DEV__ = window.location.hostname is 'localhost'

    # use Cozy instance locale or navigator language or "en" by default
    locale = window.locale or window.navigator.language or "en"
    locales = {}
    #try
        #console.log __dirname
        #locales = require "./locales/#{locale}"
    #catch err
        #console.log err
        #locales = require "./locales/en"
    polyglot = new Polyglot()
    polyglot.extend locales
    window.t = polyglot.t.bind polyglot

    hello = React.createClass
        render: ->
          div className: "commentbox", "hello, world! i am a commentbox."

    React.renderComponent new hello, document.body

    # Initialize Backbone Router
    React.renderComponent new router, document.body
    #@router = new Router()
    #window.router = @router
