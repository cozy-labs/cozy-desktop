/** The systray icon.
 *
 * @module gui/js/tray
 */

const { Tray, Menu, MenuItem, nativeImage } = require('electron')
const { translate } = require('./i18n')
const path = require('path')
const _ = require('lodash')

let tray = null
let lastStatus = ''

const imgs = path.resolve(__dirname, '..', 'images')
const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const isKde =
  process.env.XDG_CURRENT_DESKTOP &&
  process.env.XDG_CURRENT_DESKTOP.match(/KDE/)

const platformIcon = (iconName, { pressed = false } = {}) =>
  nativeImage.createFromPath(
    isMac
      ? pressed
        ? `${imgs}/tray-icon-osx/${iconName}Highlight.png`
        : `${imgs}/tray-icon-osx/${iconName}Template.png`
      : isWindows
      ? `${imgs}/tray-icon-win/${iconName}.png`
      : isKde
      ? `${imgs}/tray-icon-linux-kde/${iconName}.png`
      : `${imgs}/tray-icon-linux/${iconName}.png`
  )

const setImage = iconName => {
  const icon = platformIcon(iconName)
  tray.setImage(icon)

  if (isMac) {
    const pressedIcon = platformIcon(iconName, { pressed: true })
    tray.setPressedImage(pressedIcon)
  }
}

const systrayInfo = (appStatus, label) => {
  switch (appStatus) {
    case 'error':
      return ['error', label]
    case 'user-alert':
      return ['pause', label]
    case 'syncing':
      return [
        'sync',
        translate('Tray Sync in progress') + (label ? ` ‟${label}“` : '…')
      ]
    case 'up-to-date':
    case 'online':
      return ['idle', translate('Tray Your cozy is up to date')]
    case 'offline':
      return ['offline', translate('Tray Offline')]
    default:
      return ['idle', '']
  }
}

const setStatus = _.throttle(
  (appStatus, label) => {
    const [iconName, tooltip] = systrayInfo(appStatus, label)
    const status = `${iconName}:${label}`

    if (lastStatus != status) {
      setImage(iconName)
      tray.setToolTip(tooltip)
      lastStatus = status
    }
  },
  5000, // no more than one update per 5 seconds
  { leading: true, trailing: true } // execute first and last upades
)

const init = (app, listener) => {
  tray = new Tray(nativeImage.createEmpty())

  // XXX: updating the status should always come after the initialization of the
  // `tray` as we use it.
  setStatus('idle', 'loading')

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

const wasInitiated = () => {
  return tray != null
}

// old tray menu
// TODO: reuse or remove
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

module.exports = {
  init,
  setStatus,
  wasInitiated
}
