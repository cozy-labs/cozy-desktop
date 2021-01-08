/** The systray icon.
 *
 * @module gui/js/tray
 */

const { Tray, Menu, MenuItem } = require('electron')
const { translate } = require('./i18n')
const path = require('path')

let tray = null

const imgs = path.resolve(__dirname, '..', 'images')
const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const isKde =
  process.env.XDG_CURRENT_DESKTOP &&
  process.env.XDG_CURRENT_DESKTOP.match(/KDE/)

module.exports.init = (app, listener) => {
  let icon = isMac
    ? `${imgs}/tray-icon-osx/idleTemplate.png`
    : isWindows
    ? `${imgs}/tray-icon-win/idle.png`
    : isKde
    ? `${imgs}/tray-icon-linux-kde/idle.png`
    : `${imgs}/tray-icon-linux/idle.png`
  tray = new Tray(icon)
  app.on('before-quit', () => tray.destroy())

  let cachedBounds = null
  const clicked = (e, bounds) => {
    cachedBounds = bounds && bounds.y !== 0 ? bounds : cachedBounds
    listener(tray.getBounds ? tray.getBounds() : cachedBounds)
  }

  // On Linux systems without libappindicator-gtk3 or other systems, clicks on
  // the systray icon trigger events that can be caught to display the app
  // window for example.
  tray.on('click', clicked)
  tray.on('right-click', clicked)
  tray.on('double-click', clicked)
  tray.setToolTip('loading')

  if (!isMac) {
    // When click events are not triggered, we need to display a context menu so
    // users can open the app's window.
    const cm = Menu.buildFromTemplate([
      { label: translate('Tray Quit application'), click: app.quit }
    ])
    cm.insert(
      0,
      new MenuItem({
        label: translate('Tray Show application'),
        click: clicked
      })
    )
    cm.insert(1, new MenuItem({ type: 'separator' }))
    tray.setContextMenu(cm)
  }
  setStatus('idle')
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

const systrayInfo = (status, label) => {
  switch (status) {
    case 'error':
      return ['error', label]
    case 'user-action-required':
      return ['pause', label]
    case 'syncing':
      return ['sync', translate('Tray Syncing') + (label ? ` ‟${label}“` : '…')]
    case 'up-to-date':
    case 'online':
      return ['idle', translate('Tray Your cozy is up to date')]
    case 'offline':
      return ['offline', translate('Tray Offline')]
    default:
      return ['idle', '']
  }
}

const setStatus = (module.exports.setStatus = (status, label) => {
  const [icon, tooltip] = systrayInfo(status, label)

  tray.setToolTip(tooltip)
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
