# Data proxy configuration wizard.


# Intro splash screen, it's a welcome message.
Intro = React.createClass

    render: ->
        Container null,
           div className: 'intro txtcenter mtl',
               img
                   id: 'logo'
                   src: 'client/public/icon/bighappycloud.png'
               p className: 'mtl biggest', t 'welcome to the cozy desktop'
               Button
                    className: 'mtl bigger pam'
                    onClick: @onEnterClicked
                    text: t 'start configuring your device'

    onEnterClicked: ->
        #$('.intro').addClass 'slide-leave-up'
        renderState 'STEP1'


cozyUrl = ""
cozyPassword = ""
# Step 2 of the configuration. It asks for the remote Cozy URL and for the
# remote Cozy password.
# Once done, it registers the device to the Cozy then it saves the cozy URL in
# the configuration.
ConfigFormStepOne = React.createClass

    getInitialState: ->
        isDeviceName = @props.url? and @props.url isnt ''
        isPath = @props.path? and @props.path isnt ''

        validForm: isDeviceName and isPath

    render: ->
        buttonClass = 'right bottom'
        buttonClass += ' disabled' unless @state.validForm

        Container null,
            Title
                text: t 'cozy files configuration 1 on 2'
            Line className: 'explanation',
                p null, t 'second step text'
            Field
                label: t 'your remote url'
                fieldClass: 'w300p'
                inputRef: 'remoteUrl'
                defaultValue: @props.url
                ref: 'remoteUrlField'
                placeholder: 'john.cozycloud.cc'
                onChange: @onFieldChanged
                onKeyUp: @onUrlKeyUp
            Field
                label: t 'your remote password'
                fieldClass: 'w300p'
                type: 'password'
                inputRef: 'remotePassword'
                defaultValue: @props.remotePassword
                ref: 'remotePasswordField'
                onChange: @onFieldChanged
                onKeyUp: @onPasswordKeyUp
                onClick: @onCompleteUrl
            Line null,
                Button
                    className: buttonClass
                    ref: 'nextButton'
                    onClick: @onSaveButtonClicked
                    text: t 'register device and synchronize'

    componentDidMount: ->
        node = @refs.remoteUrlField.refs.remoteUrl.getDOMNode()
        $(node).focus()

    onFieldChanged: ->
        fieldUrl = @refs.remoteUrlField
        fieldPassword = @refs.remotePasswordField
        @setState
            validForm: isValidForm [fieldUrl, fieldPassword]

    onUrlKeyUp: (event) ->
        if event.keyCode is 13
            node = @refs.remotePasswordField.refs.remotePassword.getDOMNode()
            $(node).focus()

    onCompleteUrl: ->
        fieldUrl = @refs.remoteUrlField.getValue()
        if fieldUrl and fieldUrl.indexOf('.') is -1
            @refs.remoteUrlField.setValue(fieldUrl + ".cozycloud.cc")

    onPasswordKeyUp: (event) ->
        fieldUrl = @refs.remoteUrlField
        if event.keyCode is 13
            @onSaveButtonClicked()
        @onCompleteUrl()
        fieldUrl.setError ""

    onSaveButtonClicked: ->
        fieldUrl = @refs.remoteUrlField
        fieldPassword = @refs.remotePasswordField

        if isValidForm [fieldUrl, fieldPassword]
            config = require './backend/config'
            device = require './backend/device'

            url = fieldUrl.getValue()
            if url.indexOf('http') < 0
                url = "https://#{fieldUrl.getValue()}"
            password = fieldPassword.getValue()
            cozyUrl = url
            cozyPassword = password
            options =
                url: url
                password: password

            device.checkCredentials options, (err) ->
                if err and err is "getaddrinfo ENOTFOUND"
                    fieldUrl.setError 'not found'
                else if err?
                    fieldUrl.setError "bad credentials"
                else
                    renderState 'STEP2'



# First configuration step, it asks for the device name used to register to the
# Cozy and for the directory in which store the synced fileds.
# It only saves the value to the configuration file.
ConfigFormStepTwo = React.createClass

    getInitialState: ->
        isDeviceName = @props.deviceName? and @props.deviceName isnt ''
        isPath = @props.path? and @props.path isnt ''

        validForm: isDeviceName and isPath

    render: ->
        buttonClass = 'right bottom'
        buttonClass += ' disabled' unless @state.validForm
        Container null,
            Title text: t 'cozy files configuration 2 on 2'
            Line className: 'explanation',
                p null, t 'first step text'
            Help
                label: t 'your device name'
                fieldClass: 'w300p'
                inputRef: 'deviceName'
                defaultValue: @props.deviceName
                ref: 'deviceNameField'
                onChange: @onDeviceNameChanged
                onMouseOver: @onDisplayDevice
                onMouseLeave: @onUnDisplayDevice
            Folder
                label: t 'directory to synchronize your data'
                fieldClass: 'w500p'
                inputRef: 'path'
                type: 'file'
                defaultValue: @props.path
                ref: 'devicePathField'
                inputId: 'folder-input'
                onChange: @onPathChanged
                onMouseOver: @onDisplayPath
                onMouseLeave: @onUnDisplayPath
                text: t 'select folder'
            Line null,
                Button
                    className: 'left'
                    ref: 'backButton'
                    onClick: @onBackButtonClicked
                    text: t 'go back to previous step'
                Button
                    className: buttonClass
                    onClick: @onSaveButtonClicked
                    text: t 'save your device information and go to step 2'

    componentDidMount: ->
        @refs.deviceNameField.setValue t('Laptop')

    onDisplayDevice: ->
        fieldName = @refs.deviceNameField
        fieldName.displayDescription 'device description'

    onUnDisplayDevice: ->
        fieldName = @refs.deviceNameField
        fieldName.unDisplayDescription()

    onDisplayPath: ->
        fieldPath = @refs.devicePathField
        fieldPath.displayDescription 'path description'

    onUnDisplayPath: ->
        fieldPath = @refs.devicePathField
        fieldPath.unDisplayDescription()

    onBackButtonClicked: ->
        renderState 'STEP1'

    onDeviceNameChanged: ->
        fieldName = @refs.deviceNameField
        fieldPath = @refs.devicePathField
        @setState
            validForm: isValidForm [fieldName, fieldPath]

    onPathChanged: (event, files, label) ->
        fieldName = @refs.deviceNameField
        fieldPath = @refs.devicePathField
        @setState
            validForm: isValidForm [fieldName, fieldPath]

    onSaveButtonClicked: ->
        fieldName = @refs.deviceNameField
        fieldPath = @refs.devicePathField
        if @state.validForm
            config = require './backend/config'
            device = require './backend/device'
            config.updateSync
                deviceName: fieldName.getValue()
                path: fieldPath.getValue()
            device.deviceName = fieldName.getValue()
            device.path = fieldPath.getValue()
            device.url = cozyUrl
            saveConfig = (err, credentials) ->
                if err
                    console.log err
                    alert "An error occured while registering your device. #{err}"
                    renderState 'STEP1'
                else
                    options =
                        url: cozyUrl
                        deviceId: credentials.id
                        devicePassword: credentials.password
                    config.updateSync options

                    console.log 'Remote Cozy properly configured to work ' + \
                                'with current device.'
                    renderState 'STATE'

            options =
                url: cozyUrl
                deviceName: device.deviceName
                password: cozyPassword
            device.registerDevice options, (err, credentials) ->
                if err?
                    fieldName.setError "device already used"
                else
                    saveConfig(err, credentials)



