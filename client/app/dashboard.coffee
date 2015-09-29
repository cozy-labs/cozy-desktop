moment = require 'moment'

StateView = React.createClass

    getInitialState: ->
        logs: []
        sync: false

    render: ->
        logs = []
        if @state.logs.length is 0
            params =
                className: 'smaller', key: '0'
            logs.push Line params, 'nothing to notice...'
        else
            i = 0
            for log in @state.logs
                logs.push Line key: "log-#{i++}", className: 'smaller', log
            logs.reverse()
            if logs.length > 6
                logs = logs.slice 0, 6

        if @state.sync
            state = t 'on'
            syncButtonLabel = t 'stop sync'
        else
            state = t 'off'
            syncButtonLabel = t 'start sync'

        Container className: 'line',
            Title text: 'Cozy Desktop'
            Container className: 'mod parameters',
                Subtitle text: t 'parameters'
                InfoLine
                    label: t('path'), value: device.path,
                    text: t('open folder'), onClick: @onOpenFolder
                InfoLine
                    label: t('url'), value: device.url,
                    text: t('open url'), onClick: @onOpenUrl
                InfoLine
                    label: t('sync state'), value: state,
                    text: syncButtonLabel, onClick: @onSyncClicked
                InfoLine
                    label: t('device name'), value: device.deviceName,
                    text: t('delete configuration'), onClick: @onDeleteConfigurationClicked
            Line className: 'modifications',
                Subtitle text: t 'last changes'
                logs

    onSyncClicked: ->
        # TODO add a checkbox to change this option
        @sync force: false

    sync: (options)->
        notifier = require 'node-notifier'
        remoteEventWatcher = require './backend/remote_event_watcher'
        localEventWatcher = require './backend/local_event_watcher'
        publisher = require './backend/publisher'
        pouch = require './backend/db'
        gui = require 'nw.gui'
        open = require 'open'
        readonly = false  # FIXME

        if @state.sync
            @setState sync: false
            remoteEventWatcher.cancel()
            @displayLog 'Synchronization is off'
            notifier.notify
                title: 'Synchronization has been stopped'
                icon: 'client/public/icon/bighappycloud.png'
            menu.items[10].label = t 'start sync'

        else
            @displayLog 'Synchronization is on...'
            @displayLog 'First synchronization can take a while to init...'
            @setState sync: true
            menu.items[10].label = t 'stop sync'
            notifier.notify
                title: 'Synchronization is on'
                message: 'First synchronization can take a while to init'
                icon: 'client/public/icon/bighappycloud.png'
            tray.icon = 'client/public/icon/icon_sync.png'

            pouch.addAllFilters ->

                remoteEventWatcher.init readonly, ->
                    remoteEventWatcher.start()

                    # Delay the start of the FS watcher to keep applying remote
                    # modifications before local ones.
                    # setTimeout (-> localEventWatcher.start()), 2000

            #TODO: Arrange published names

            # First sync
            publisher.on 'firstSyncDone', =>
                tray.icon = 'client/public/icon/icon.png'
                @displayLog "Successfully synchronized"

            # Remote to local messages
            publisher.on 'downloadingRemoteChanges', =>
                @displayLog 'Downloading missing files from remote...'

            publisher.on 'binaryDownloadStdebug', (path) =>
                tray.icon = 'client/public/icon/icon_sync.png'
                @displayLog "File #{path} is downloading..."

            publisher.on 'binaryDownloaded', (path) =>
                tray.icon = 'client/public/icon/icon.png'
                @displayLog "File #{path} downloaded"
                @fileModification path

            publisher.on 'applyingChanges', =>
                tray.icon = 'client/public/icon/icon_sync.png'

            publisher.on 'changesApplied', =>
                tray.icon = 'client/public/icon/icon.png'

            publisher.on 'fileDeleted', (path) =>
                @displayLog "File #{path} deleted"

            publisher.on 'fileMoved', (info) =>
                {previousPath, newPath} = info
                @displayLog "File moved: #{previousPath} -> #{newPath}"
                @fileModification newPath

            publisher.on 'folderDeleted', (path) =>
                @displayLog "Folder #{path} deleted"

            publisher.on 'folderMoved', (info) =>
                {previousPath, newPath} = info
                @displayLog "Folder moved: #{previousPath} -> #{newPath}"

            # Local to remote messages
            publisher.on 'uploadingLocalChanges', =>
                @displayLog 'Uploading modifications to remote...'

            publisher.on 'uploadBinary', (path) =>
                tray.icon = 'client/public/icon/icon_sync.png'
                @displayLog "File #{path} is uploading..."

            publisher.on 'binaryUploaded', (path) =>
                tray.icon = 'client/public/icon/icon.png'
                @displayLog "File #{path} uploaded"
                @fileModification path

            publisher.on 'fileAddedLocally', (path) =>
                @displayLog "File #{path} locally added"

            publisher.on 'fileDeletedLocally', (path) =>
                @displayLog "File #{path} locally deleted"

            publisher.on 'fileDeletedLocally', (path) =>
                @displayLog "File #{path} locally deleted"

            publisher.on 'fileModificationLocally', (path) =>
                @displayLog "File #{path} locally changed"

            publisher.on 'folderAddedLocally', (path) =>
                @displayLog "Folder #{path} locally added"

            publisher.on 'folderDeletedLocally', (path) =>
                @displayLog "Folder #{path} locally deleted"


    displayLog: (log) ->
        logs = @state.logs

        @setState logs: logs
        tray.tooltip = log

        if log.length > 70
            length = log.length
            if log.substring(0,2) is "Fi"
                log = "File... #{log.substring(length-67, length)}"
            else
                log = "Folder...#{log.substring(length-67, length)}"

        logs.push moment().format('HH:mm:ss ') + log

        if log.length > 40
            length = log.length
            log = "..." + log.substring(length-37, length)

        menu.items[5].label = log

    fileModification: (file) ->
        modMenu = menu.items[6].submenu
        modMenu.insert new gui.MenuItem
            type: 'normal'
            label: file
            click: ->
                open file

        # Do not store more than 10 menu items
        if modMenu.items.length > 12
            modMenu.removeAt modMenu.items.length-3

    onDeleteConfigurationClicked: ->
        if confirm('Are you sure?')

            remoteEventWatcher = require './backend/remote_event_watcher'
            config = require './backend/config'
            fs = require 'fs-extra'
            @setState sync: false
            remoteEventWatcher.cancel()

            fs.remove configDir, (err) ->
                alert t 'Configuration deleted.'
                tray.remove()
                renderState 'INTRO'

    onDeleteFilesClicked: ->
        del = require 'del'
        del "#{device.path}/*", force: true, (err) ->
            console.log err if err
            alert t 'All files were successfully deleted.'

    onOpenFolder: ->
        open device.path

    onOpenUrl: ->
        open "#{device.url}/apps/files"
