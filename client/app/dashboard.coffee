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
        # TODO add a checkbox to change this option
        @sync force: false

    sync: (options)->
        replication = require './backend/replication'
        filesystem = require './backend/filesystem'
        publisher = require './backend/publisher'
        pouch = require './backend/db'

        if @state.sync
            @setState sync: false
            replication.replicator.cancel() if replication.replicator?
            @displayLog 'Synchronization is off'
            menu.items[0].label = 'Start Sync'

        else
            @displayLog 'Synchronization is on...'
            @displayLog 'First synchronization can take a while to init...'
            @setState sync: true
            menu.items[0].label = 'Stop Sync'
            tray.icon = 'client/public/icon/icon_sync.png'

            pouch.addAllFilters ->
                filesystem.watchChanges true, true
                replication.runReplication
                    force: options.force

            #TODO: Arrange published names

            # First sync
            publisher.on 'firstSyncDone', =>
                tray.icon = 'client/public/icon/icon.png'
                @displayLog "Successfully synchronized"

            # Remote to local messages
            publisher.on 'binaryPresent', (path) =>
                @displayLog "File #{path} is already there."
            publisher.on 'binaryDownloadStart', (path) =>
                tray.icon = 'client/public/icon/icon_sync.png'
                @displayLog "File #{path} is downloading..."
            publisher.on 'binaryDownloaded', (path) =>
                tray.icon = 'client/public/icon/icon.png'
                @displayLog "File #{path} downloaded"
            publisher.on 'fileDeleted', (path) =>
                @displayLog "File #{path} deleted"
            publisher.on 'fileMoved', (info) =>
                {previousPath, newPath} = info
                @displayLog "File moved: #{previousPath} -> #{newPath}"
            publisher.on 'directoryEnsured', (path) =>
                @displayLog "Folder #{path} ensured"
            publisher.on 'folderDeleted', (path) =>
                @displayLog "Folder #{path} deleted"
            publisher.on 'folderMoved', (info) =>
                {previousPath, newPath} = info
                @displayLog "Folder moved: #{previousPath} -> #{newPath}"

            # Local to remote messages
             publisher.on 'uploadBinary', (path) =>
                tray.icon = 'client/public/icon/icon_sync.png'
                @displayLog "File #{path} is uploading..."
            publisher.on 'binaryUploaded', (path) =>
                tray.icon = 'client/public/icon/icon.png'
                @displayLog "File #{path} uploaded"
            publisher.on 'fileAddedLocally', (path) =>
                @displayLog "File #{path} locally added"
            publisher.on 'fileDeletedLocally', (path) =>
                @displayLog "File #{path} locally deleted"
            publisher.on 'fileDeletedLocally', (path) =>
                @displayLog "File #{path} locally deleted"
            publisher.on 'fileChangedLocally', (path) =>
                @displayLog "File #{path} locally changed"
            publisher.on 'folderAddedLocally', (path) =>
                @displayLog "Folder #{path} locally added"
            publisher.on 'folderDeletedLocally', (path) =>
                @displayLog "Folder #{path} locally deleted"


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
