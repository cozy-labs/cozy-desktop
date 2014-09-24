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
        #$('.intro').addClass 'slide-leave-up'
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

            url = "https://#{fieldUrl.getValue()}"
            password = fieldPassword.getValue()
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


StateView = React.createClass

    getInitialState: ->
        logs: []
        sync: true

    render: ->
        logs = []
        if @state.logs.length is 0
            logs.push Line className: 'smaller', 'nothing to notice...'
        else
            logs.push Line className: 'smaller', log for log in @state.logs

        if @state.sync
            state = t 'on'
            syncButtonLabel = t 'stop sync'
        else
            state = t 'on'
            syncButtonLabel = t 'stop sync'
        @startSync()

        Container className: 'line',
            Container className: 'mod w50 left',
                Title text: 'Cozy Data Proxy'
                Subtitle text: 'Parameters'
                InfoLine label: t('device name'), value: device.deviceName
                InfoLine
                    label: t('path')
                    link:
                        type: 'file'
                    value: device.path
                InfoLine label: t('url'), value: device.url
                InfoLine label: t('Sync state'), value: state
                Subtitle text: 'Actions'
                Line null,
                    Button
                        className: 'left action'
                        onClick: @onSyncClicked
                        text: syncButtonLabel
                Line null,
                    Button
                        className: 'left'
                        onClick: @onResyncClicked
                        text: t 'resync all'
                Line null,
                    Button
                        className: 'left'
                        onClick: @clearLogs
                        text: t 'clear logs'
                Subtitle text: 'Danger Zone'
                Line null,
                    Button
                        className: 'left'
                        onClick: @onDeleteFilesClicked
                        text: t 'delete files'
                Line null,
                    Button
                        className: 'left'
                        onClick: @onDeleteConfigurationClicked
                        text: t 'delete configuration'

            Container className: 'mod w50 left',
                Subtitle text: 'Logs'
                logs

    startSync: ->

    clearLogs: ->
        @setState logs: []

    onDeleteFilesClicked: ->
        del = require 'del'
        del "#{device.path}/*", force: true, (err) ->
            console.log err if err
            alert t 'All files were successfully deleted.'

    onDeleteConfigurationClicked: ->
        config = require './backend/config'
        config.removeRemoteCozy device.deviceName
        config.saveConfig()
        alert t 'Configuration deleted.'
        renderState 'INTRO'


    onResyncClicked: ->
        replication = require './backend/replication'
        @clearLogs()
        @displayLog 'Replication is starting'

        onChange = (change) =>
            @displayLog "#{change.docs_written} elements replicated"

        onComplete = =>
            @displayLog 'Replication is finished.'

        replicator = replication.runReplication
            fromRemote: true
            toRemote: false
            continuous: false
            rebuildFs: true
            fetchBinary: true

        replicator.on 'change', onChange

    displayLog: (log) ->
        logs = @state.logs
        moment = require 'moment'
        logs.push moment().format('HH:MM:SS ') + log
        @setState logs: logs

    onResyncClicked: ->
        replication = require './backend/replication'
        filesystem = require './backend/filesystem'
        binary = require './backend/binary'

        @clearLogs()
        @displayLog 'Replication is starting'

        onChange = (change) =>
            @displayLog "#{change.docs_written} elements replicated"

        onComplete = =>
            @displayLog 'Replication is finished.'

        onBinaryDownloaded = (binaryPath) =>
            @displayLog "File #{binaryPath} downloaded"

        onDirectoryCreated = (dirPath) =>
            @displayLog "Folder #{dirPath} created"


        replicator = replication.runReplication
            fromRemote: true
            toRemote: false
            continuous: false
            rebuildFs: true
            fetchBinary: true

        replicator.on 'change', onChange
        replicator.on 'complete', onComplete

        binary.infoPublisher.on 'binaryDownloaded', onBinaryDownloaded
        filesystem.infoPublisher.on 'directoryCreated', onDirectoryCreated
