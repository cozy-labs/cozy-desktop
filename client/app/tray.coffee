gui = require 'nw.gui'
open = require 'open'
config = require './backend/config'
remoteConfig = config.getConfig()
#gui.Window.get().showDevTools()

displayTrayMenu = ->
    @tray = new gui.Tray
        icon: 'client/public/icon/icon.png'

    @menu = new gui.Menu()

    @menu.append new gui.MenuItem
        type: 'normal'
        label: t 'open url'
        click: ->
          open "#{remoteConfig.url}/apps/files"

    @menu.append new gui.MenuItem
        type: 'normal'
        label: "#{t('open folder')} : #{path.basename remoteConfig.path}"
        click: ->
            open device.path

    @menu.append new gui.MenuItem
        type: 'separator'

    @menu.append new gui.MenuItem
        type: 'normal'
        label: t 'refreshing available space'
        enabled: false

    @menu.append new gui.MenuItem
        type: 'separator'

    @menu.append new gui.MenuItem
        type: 'normal'
        label: t 'synchronizing'
        enabled: false

    lastModificationsMenu = new gui.Menu()
    lastModificationsMenu.append new gui.MenuItem
        type: 'separator'

    lastModificationsMenu.append new gui.MenuItem
        type: 'normal'
        label: t 'show logs'
        click: ->
            win.show()

    @menu.append new gui.MenuItem
        type: 'normal'
        label: t 'last changes'
        submenu: lastModificationsMenu

    @menu.append new gui.MenuItem
        type: 'separator'

    @menu.append new gui.MenuItem
        type: 'normal'
        label: t 'parameters'
        click: ->
          win.show()

    @menu.append new gui.MenuItem
        type: 'separator'

    @menu.append new gui.MenuItem
        type: 'normal'
        label: t 'start sync'
        click: =>
            currentComponent.onSyncClicked()

    @menu.append new gui.MenuItem
        type: 'normal'
        label: t 'quit'
        click: ->
            win.close true

    @tray.menu = @menu

    @tray.on 'click', ->
        win.show()

    setDiskSpace = ->
        config.getDiskSpace (err, res) =>
            if res
                percentage = (res.diskSpace.usedDiskSpace / res.diskSpace.totalDiskSpace) * 100
                @menu.items[3].label = "#{Math.round percentage}% of #{res.diskSpace.totalDiskSpace}GB #{t('used')}"

    setInterval ->
      setDiskSpace()
    , 20000
