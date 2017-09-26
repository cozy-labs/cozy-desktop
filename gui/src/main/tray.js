const {Tray, Menu} = require('electron')
const imgs = `${__dirname}/../../images`
const {translate} = require('./i18n')

let tray = null

module.exports.init = (app, cb) => {
  tray = new Tray(`${imgs}/tray-icon-linux/idle.png`)

  let cachedBounds = null
  const clicked = (e, bounds) => {
    cachedBounds = bounds || cachedBounds
    cb((tray.getBounds && tray.getBounds()) || cachedBounds)
  }

  tray.on('click', clicked)
  tray.on('right-click', clicked)
  tray.on('double-click', clicked)
  tray.setToolTip('loading')
  let cm = Menu.buildFromTemplate([
   { label: translate('Tray Quit application'), click: app.quit }
  ])
  tray.setContextMenu(cm)
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

module.exports.setState = (state, filename) => {
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
    icon = 'pause'
    statusLabel = translate('Tray Offline')
  }

  tray.setToolTip(statusLabel)
  if (process.platform === 'darwin') {
    tray.setImage(`${imgs}/tray-icon-osx/${icon}Template.png`)
    tray.setPressedImage(`${imgs}/tray-icon-osx/${icon}Highlight.png`)
  } else {
    tray.setImage(`${imgs}/tray-icon-linux/${icon}.png`)
  }
}
