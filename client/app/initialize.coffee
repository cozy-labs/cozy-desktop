renderState = (state) ->
    getCurrentComponent = (state) ->
        switch state
            when 'INTRO'
                win.show()
                Intro()
            when 'STEP1'
                win.show()
                ConfigFormStepOne device
            when 'STEP2'
                win.show()
                ConfigFormStepTwo device
            when 'STEP3'
                win.show()
                ConfigFormStepThree device
            when 'STATE'
                if not device?
                    device = configHelpers.getDevice()
                displayTrayMenu()
                StateView device
            else
                win.show()
                Intro()

    @currentComponent = React.renderComponent getCurrentComponent(state), document.body
    @currentComponent.onSyncClicked() if state is 'STATE'
    $("#folder-input").attr('nwdirectory', '') if state is 'STEP2'


# Waits for the DOM to be ready
window.onload = ->

    window.__DEV__ = window.location.hostname is 'localhost'

    # use Cozy instance locale or navigator language or "en" by default
    locales = window.locale or window.navigator.language or "en"
    locales = {}
    polyglot = new Polyglot()
    locales = en
    if process.env.LANG?.indexOf('fr') is 0
        locales = fr
    locales = en
    polyglot.extend locales
    window.t = polyglot.t.bind polyglot
    #win.hide()

    renderState configHelpers.getState()
