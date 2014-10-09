# Data proxy configuration wizard.


# Intro splash screen, it's a welcome message.
Intro = React.createClass

    render: ->
        Container null,
           div className: 'intro txtcenter mtl',
               img
                   id: 'logo'
                   src: 'client/public/icon/bighappycloud.png'
               p className: 'mtl biggest', t 'welcome to the cozy data proxy'
               Button
                    className: 'mtl bigger pam'
                    onClick: @onEnterClicked
                    text: t 'start configuring your device'

    onEnterClicked: ->
        #$('.intro').addClass 'slide-leave-up'
        renderState 'STEP1'


# First configuration step, it asks for the device name used to register to the
# Cozy and for the directory in which store the synced fileds.
# It only saves the value to the configuration file.
ConfigFormStepOne = React.createClass
    render: ->
        Container null,
            Title text: t 'cozy files configuration 1 on 2'
            Field
                label: t 'your device name'
                fieldClass: 'w300p'
                inputRef: 'deviceName'
                defaultValue: @props.deviceName
                ref: 'deviceNameField'
                placeholder: 'Laptop'
            Field
                label: t 'directory to synchronize your data'
                fieldClass: 'w500p'
                inputRef: 'path'
                type: 'file'
                defaultValue: @props.path
                ref: 'devicePathField'
                inputId: 'folder-input'
            Line null,
                Button
                    className: 'right'
                    onClick: @onSaveButtonClicked
                    text: t 'save your device information and go to step 2'

    onSaveButtonClicked: ->
        fieldName = @refs.deviceNameField
        fieldPath = @refs.devicePathField
        isValid = isValidForm [fieldName, fieldPath]
        if isValid
            config = require './backend/config'
            config.updateSync
                deviceName: fieldName.getValue()
                path: fieldPath.getValue()
            renderState 'STEP2'
        else
            alert 'a value is missing'


# Step 2 of the configuration. It asks for the remote Cozy URL and for the
# remote Cozy password.
# Once done, it registers the device to the Cozy then it saves the cozy URL in
# the configuration.
ConfigFormStepTwo = React.createClass

    render: ->
        Container null,
            Title
                text: t 'cozy files configuration 2 on 2'
            Field
                label: t 'your remote url'
                fieldClass: 'w300p'
                inputRef: 'remoteUrl'
                defaultValue: @props.url
                ref: 'remoteUrlField'
                placeholder: 'john.cozycloud.cc'
            Field
                label: t 'your remote password'
                fieldClass: 'w300p'
                type: 'password'
                inputRef: 'remotePassword'
                defaultValue: @props.remotePassword
                ref: 'remotePasswordField'
            Line null,
                Button
                    className: 'left'
                    ref: 'backButton'
                    onClick: @onBackButtonClicked
                    text: t 'go back to previous step'
                Button
                    className: 'right'
                    ref: 'nextButton'
                    onClick: @onSaveButtonClicked
                    text: t 'register device and synchronize'

    onBackButtonClicked: ->
        renderState 'STEP1'

    onSaveButtonClicked: ->
        fieldUrl = @refs.remoteUrlField
        fieldPassword = @refs.remotePasswordField

        if isValidForm [fieldUrl, fieldPassword]
            config = require './backend/config'
            replication = require './backend/replication'

            url = "https://#{fieldUrl.getValue()}"
            password = fieldPassword.getValue()
            console.log device
            options =
                url: url
                deviceName: device.deviceName
                password: password

            saveConfig = (err, credentials) ->
                if err
                    console.log err
                    alert "An error occured while registering your device. #{err}"
                else
                    options =
                        url: url
                        deviceId: credentials.id
                        devicePassword: credentials.password
                    config.updateSync options

                    console.log 'Remote Cozy properly configured to work ' + \
                             'with current device.'
                    renderState 'STATE'

            replication.registerDevice options, saveConfig
        else
            alert 'a value is missing'
