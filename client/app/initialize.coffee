{div, label, input, h1} = React.DOM

# Waits for the DOM to be ready
window.onload = ->

    window.__DEV__ = window.location.hostname is 'localhost'

    # use Cozy instance locale or navigator language or "en" by default
    locale = window.locale or window.navigator.language or "en"
    locales = {}
    polyglot = new Polyglot()
    polyglot.extend locales
    window.t = polyglot.t.bind polyglot

    configComponent = ConfigForm device
    React.renderComponent configComponent, document.body
