win = gui.Window.get()

win.setMaximumSize 600, 800
win.setMinimumSize 600, 800
win.setResizable false
win.setPosition 'center'

win.on 'close', ->
    win.hide()
