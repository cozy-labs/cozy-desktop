ReactCSSTransitionGroup = React.addons.CSSTransitionGroup


isValidForm = (fields) ->
    for field in fields
        unless field.isValid()
            return false
    true


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
        $('.intro').addClass 'slide-leave-up'
        renderState 'STEP1'


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
                defaultValue: @props.path
                ref: 'devicePathField'
                placeholder: '/home/john/mycozyfolder'
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


ConfigFormStepTwo = React.createClass
    render: ->
        Container null,
            Title text: t 'cozy files configuration 2 on 2'
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
        isValid = isValidForm [fieldUrl, fieldPassword]
        if isValid
            config = require './backend/config'
            replication = require './backend/replication'
            promise = require './backend/promise'

            url = "https://#{fieldUrl.getValue()}"
            password = fieldPassword.getValue()
            options =
                url: url
                deviceName: device.deviceName
                password: password

            saveConfig = (err, credentials) ->
                if err
                    console.log err
                    console.log 'An error occured while registering your device.'
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


StateView = React.createClass
    render: ->

        @state ?= changes: []
        changes = []
        for change in @state.changes
            changes.push Line null, change

        Container null,
            Title text: 'Cozy Data Proxy'
            Subtitle text: 'Parameters'
            InfoLine label: t('your device name'), value: device.deviceName
            InfoLine
                label: t('path')
                link:
                    type: 'file'
                value: device.path
            InfoLine label: t('url'), value: device.url
            Subtitle text: 'Actions'
            Line null,
                Button
                    className: 'left'
                    ref: 'backButton'
                    onClick: @onResyncClicked
                    text: t 'resync all'
            Line null,
                Button
                    className: 'left'
                    ref: 'backButton'
                    onClick: @onDeleteClicked
                    text: t 'delete configuration'
                    text: t 'delete configuration and files'
            changes


    onResyncClicked: ->
        alert 'resync all'
        replication = require './backend/replication'

        @state.changes = []

        onChange = (change) =>
            @state.changes.push "#{change.docs_written} elements replicated"

        replicator = replication.runReplication
            fromRemote: true
            toRemote: false
            continuous: false
            rebuildFs: true
            fetchBinary: true

        replicator.on 'change', onChange
