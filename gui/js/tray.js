const { Tray, Menu, MenuItem } = require('electron')
const { translate } = require('./i18n')
const path = require('path')

let tray = null

const imgs = path.resolve(__dirname, '..', 'images')

module.exports.init = (app, listener) => {
  let icon =
    process.platform === 'darwin'
      ? `${imgs}/tray-icon-osx/idleTemplate.png`
      : process.platform === 'win32'
      ? `${imgs}/tray-icon-win/idle.png`
      : process.env.XDG_CURRENT_DESKTOP &&
        process.env.XDG_CURRENT_DESKTOP.match(/KDE/)
      ? `${imgs}/tray-icon-linux-kde/idle.png`
      : `${imgs}/tray-icon-linux/idle.png`
  tray = new Tray(icon)
  app.on('before-quit', () => tray.destroy())

  let cachedBounds = null
  const clicked = (e, bounds) => {
    cachedBounds = bounds && bounds.y !== 0 ? bounds : cachedBounds
    listener(tray.getBounds ? tray.getBounds() : cachedBounds)
  }

  tray.on('click', clicked)
  tray.on('right-click', clicked)
  tray.on('double-click', clicked)
  tray.setToolTip('loading')

  // on MacOS, Unity & KDE, if a tray has a contextmenu, click event does not work
  // on Gnome, if a tray has no contextmenu, tray is not shown
  // @TODO test on windows

  const isMac = process.platform !== 'darwin'
  const isUnity =
    process.env.XDG_CURRENT_DESKTOP &&
    process.env.XDG_CURRENT_DESKTOP.match(/Unity/)
  const isKDE =
    process.env.XDG_CURRENT_DESKTOP &&
    process.env.XDG_CURRENT_DESKTOP.match(/KDE/)

  if (isUnity || isMac || isKDE) {
    const cm = Menu.buildFromTemplate([
      { label: translate('Tray Quit application'), click: app.quit }
    ])
    if (isUnity || isKDE) {
      cm.insert(
        0,
        new MenuItem({
          label: translate('Tray Show application'),
          click: clicked
        })
      )
      cm.insert(1, new MenuItem({ type: 'separator' }))
    }
    tray.setContextMenu(cm)
  }
  setState('idle')
}

// old tray menu
/*
const goToTab = (tab) => {
  const alreadyShown = !!mainWindow
  showWindow()
  if (alreadyShown) {
    trayWindow.send('go-to-tab', tab)
  } else {
    mainWindow.webContents.once('dom-ready', () => {
      trayWindow.send('go-to-tab', tab)
    })
  }
}

const menu = Menu.buildFromTemplate([
  { label: statusLabel, enabled: false },
  { type: 'separator' },
  { label: translate('Tray Open Cozy folder'), click: openCozyFolder },
  { label: translate('Tray Go to my Cozy'), click: goToMyCozy },
  { type: 'separator' },
  { label: translate('Tray Help'), click: goToTab.bind(null, 'help') },
  { label: translate('Tray Settings'), click: goToTab.bind(null, 'settings') },
  { type: 'separator' },
  { label: translate('Tray Quit application'), click: app.quit }
])
if (!mainWindow) {
  menu.insert(2, new electron.MenuItem({
    label: translate('Tray Show application'), click: showWindow
  }))
}
if (state === 'error') {
  menu.insert(2, new electron.MenuItem({
    label: translate('Tray Relaunch synchronization'), click: () => { startSync(true) }
  }))
}
if (newReleaseAvailable) {
  menu.insert(2, new electron.MenuItem({
    label: translate('Tray A new release is available'), click: goToTab.bind(null, 'settings')
  }))
}
tray.setContextMenu(menu)
*/

var setState = (module.exports.setState = (state, filename) => {
  let statusLabel = ''
  let icon = 'idle'
  if (state === 'error') {
    icon = 'error'
    statusLabel = filename
  } else if (filename) {
    icon = 'sync'
    statusLabel = `${translate('Tray Syncing')} ‟${filename}“`
  } else if (state === 'up-to-date' || state === 'online') {
    icon = 'idle'
    statusLabel = translate('Tray Your cozy is up to date')
  } else if (state === 'syncing') {
    icon = 'sync'
    statusLabel = translate('Tray Syncing') + '…'
  } else if (state === 'offline') {
    icon = 'offline'
    statusLabel = translate('Tray Offline')
  }

  tray.setToolTip(statusLabel)
  if (process.platform === 'darwin') {
    tray.setImage(`${imgs}/tray-icon-osx/${icon}Template.png`)
    tray.setPressedImage(`${imgs}/tray-icon-osx/${icon}Highlight.png`)
  } else if (process.platform === 'win32') {
    tray.setImage(`${imgs}/tray-icon-win/${icon}.png`)
  } else if (
    process.env.XDG_CURRENT_DESKTOP &&
    process.env.XDG_CURRENT_DESKTOP.match(/KDE/)
  ) {
    tray.setImage(`${imgs}/tray-icon-linux-kde/${icon}.png`)
  } else {
    tray.setImage(`${imgs}/tray-icon-linux/${icon}.png`)
  }
})
