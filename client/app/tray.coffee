gui = require 'nw.gui'
tray = new gui.Tray
    title: 'Cozy Desktop'
    icon: 'client/public/icon/icon.png'

menu = new gui.Menu()
menuItem1 = new gui.MenuItem
    type: 'normal'
    label: 'Start sync'
    click: =>
        @onSyncClicked()

menuItem2 = new gui.MenuItem
    type: 'normal'
    label: 'Show logs'
    click: ->
        win.show()

menuItem3 = new gui.MenuItem
    type: 'normal'
    label: 'Quit'
    click: ->
        win.close true

menu.append menuItem1
menu.append menuItem2
menu.append menuItem3

tray.menu = menu

tray.on 'click', ->
    win.show()
