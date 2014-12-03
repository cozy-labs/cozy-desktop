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
        label: 'Open Cozy Files in a web browser'
        click: ->
          open "#{remoteConfig.url}/apps/files"

    @menu.append new gui.MenuItem
        type: 'normal'
        label: "Open '#{path.basename remoteConfig.path}' directory"
        click: ->
          open remoteConfig.path

    @menu.append new gui.MenuItem
        type: 'separator'

    @menu.append new gui.MenuItem
        type: 'normal'
        label: '0% of 1000GB used'
        enabled: false

    @menu.append new gui.MenuItem
        type: 'separator'

    @menu.append new gui.MenuItem
        type: 'normal'
        label: ''
        enabled: false

    lastModificationsMenu = new gui.Menu()
    lastModificationsMenu.append new gui.MenuItem
        type: 'separator'

    lastModificationsMenu.append new gui.MenuItem
        type: 'normal'
        label: 'Show logs'
        click: ->
            win.show()

    @menu.append new gui.MenuItem
        type: 'normal'
        label: 'Last modifications'
        submenu: lastModificationsMenu

    @menu.append new gui.MenuItem
        type: 'separator'

    @menu.append new gui.MenuItem
        type: 'normal'
        label: 'Parameters...'
        click: ->
          win.show()

    @menu.append new gui.MenuItem
        type: 'separator'

    @menu.append new gui.MenuItem
        type: 'normal'
        label: 'Start synchronization'
        click: =>
            currentComponent.onSyncClicked()

    @menu.append new gui.MenuItem
        type: 'normal'
        label: 'Quit'
        click: ->
            win.close true

    @tray.menu = @menu

    @tray.on 'click', ->
        win.show()

    setDiskSpace = ->
        config.getDiskSpace (err, res) =>
            if res
                percentage = (res.diskSpace.usedDiskSpace / res.diskSpace.totalDiskSpace) * 100
                @menu.items[3].label = "#{Math.round percentage}% of #{res.diskSpace.totalDiskSpace}GB used"

    setInterval ->
      setDiskSpace()
    , 20000
