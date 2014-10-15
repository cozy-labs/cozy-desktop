StateView = React.createClass

    getInitialState: ->
        logs: []
        sync: false

    render: ->
        logs = []
        if @state.logs.length is 0
            logs.push Line className: 'smaller', 'nothing to notice...'
        else
            i = 0
            logs.push Line key: "log-#{i++}", className: 'smaller', log for log in @state.logs
            logs.reverse()

        if @state.sync
            state = t 'on'
            syncButtonLabel = t 'stop sync'
        else
            state = t 'off'
            syncButtonLabel = t 'start sync'

        Container className: 'line',
            Title text: 'Cozy Data Proxy'
            Container className: 'mod w50 left',
                Subtitle text: 'Parameters'
                InfoLine label: t('device name'), value: device.deviceName
                InfoLine
                    label: t('path')
                    link:
                        type: 'file'
                    value: device.path
                InfoLine label: t('url'), value: device.url
                InfoLine label: t('sync state'), value: state
            Container className: 'mod w50 left',
                Subtitle text: 'Actions'
                Line className: 'mts',
                    Button
                        className: 'left action'
                        onClick: @onSyncClicked
                        text: syncButtonLabel
                Line className: 'mts',
                    Button
                        className: 'left'
                        onClick: @onResyncClicked
                        text: t 'resync all'
                    #Button
                        #className: 'left'
                        #onClick: @onDeleteFilesClicked
                        #text: t 'delete files'
                Line className: 'mtm',
                    Button
                        className: 'smaller'
                        onClick: @onDeleteConfigurationClicked
                        text: t 'delete configuration'
            Line null
            Line null,
                Subtitle text: 'Logs'
                logs
                Line null,
                    Button
                        className: 'left smaller'
                        onClick: @clearLogs
                        text: t 'clear logs'

    onSyncClicked: ->
        if @state.sync
            @setState sync: false
            @replicator.cancel() if @replicator
            @watcher.close() if @watcher
            @displayLog 'Synchronization is on'
        else
            replication = require './backend/replication'
            filesystem = require './backend/filesystem'
            binary = require './backend/binary'
            @displayLog 'Replication is starting'

            onChange = (change) =>
                @displayLog "#{change.docs_written} elements replicated"

            onComplete = =>
                @displayLog 'Replication is finished.'

            onBinaryDownloaded = (binaryPath) =>
                @displayLog "File #{binaryPath} downloaded"

            onDirectoryCreated = (dirPath) =>
                @displayLog "Folder #{dirPath} created"

            @replicator = replication.runReplication
                fromRemote: true
                toRemote: true
                continuous: true
                rebuildFs: false
                fetchBinary: true

            @replicator.on 'change', onChange
            @replicator.on 'complete', onComplete
            @watcher = filesystem.watchChanges true, true

            binary.infoPublisher.on 'binaryDownloaded', onBinaryDownloaded
            filesystem.infoPublisher.on 'directoryCreated', onDirectoryCreated

            @displayLog 'Synchronization is on'

            @setState sync: true

    clearLogs: ->
        @setState logs: []

    displayLog: (log) ->
        logs = @state.logs
        moment = require 'moment'
        logs.push moment().format('HH:MM:SS ') + log
        @setState logs: logs

    onDeleteConfigurationClicked: ->
        config = require './backend/config'
        config.removeRemoteCozy device.deviceName
        config.saveConfig()
        alert t 'Configuration deleted.'
        renderState 'INTRO'

    onDeleteFilesClicked: ->
        del = require 'del'
        del "#{device.path}/*", force: true, (err) ->
            console.log err if err
            alert t 'All files were successfully deleted.'

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
