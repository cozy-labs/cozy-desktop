app = require 'application'

$ ->
    jQuery.event.props.push 'dataTransfer'

    locale = window.locale or "en" # default locale
    moment.lang locale

    locales = {}
    try
        locales = require "locales/#{locale}"
    catch err
        locales = require "locales/en"

    polyglot = new Polyglot()

    # we give polyglot the data
    polyglot.extend locales

    # handy shortcut
    window.t = polyglot.t.bind polyglot

    # launch the app
    app.initialize()
