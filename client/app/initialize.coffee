

renderState = (state) ->
    switch state
        when 'INTRO'
            currentComponent = Intro()
        when 'STEP1'
            currentComponent = ConfigFormStepOne device
        when 'STEP2'
            currentComponent = ConfigFormStepTwo device
        when 'STEP3'
            currentComponent = ConfigFormStepThree device
        when 'STATE'
            currentComponent = StateView device
        else
            currentComponent = Intro()

    React.renderComponent currentComponent, document.body
    $("#folder-input").attr('nwdirectory', '') if state is 'STEP1'


# Waits for the DOM to be ready
window.onload = ->

    window.__DEV__ = window.location.hostname is 'localhost'

    # use Cozy instance locale or navigator language or "en" by default
    locale = window.locale or window.navigator.language or "en"
    locales = {}
    polyglot = new Polyglot()
    locales = en
    polyglot.extend locales
    window.t = polyglot.t.bind polyglot

    renderState configHelpers.getState()
