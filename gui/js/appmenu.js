/** The macOS application menus.
 *
 * @module gui/js/appmenu
 */

const { Menu } = require('electron')
const { translate } = require('./i18n')

// FIXME: killme

module.exports.buildAppMenu = app => {
  const template = [
    {
      label: translate('AppMenu Edit'),
      submenu: [
        {
          label: translate('AppMenu Undo'),
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo'
        },
        {
          label: translate('AppMenu Redo'),
          accelerator: 'Shift+CmdOrCtrl+Z',
          role: 'redo'
        },
        { type: 'separator' },
        {
          label: translate('AppMenu Select All'),
          accelerator: 'CmdOrCtrl+A',
          role: 'selectall'
        },
        { type: 'separator' },
        {
          label: translate('AppMenu Cut'),
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: translate('AppMenu Copy'),
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: translate('AppMenu Paste'),
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        }
      ]
    },
    {
      label: translate('AppMenu Window'),
      role: 'window',
      submenu: [
        {
          label: translate('AppMenu Minimize'),
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: translate('AppMenu Close'),
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: 'Cozy Drive',
      submenu: [
        {
          label: translate('AppMenu Hide Cozy Drive'),
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: translate('AppMenu Hide Others'),
          accelerator: 'Command+Alt+H',
          role: 'hideothers'
        },
        { label: translate('AppMenu Show All'), role: 'unhide' },
        { type: 'separator' },
        {
          label: translate('AppMenu Quit'),
          accelerator: 'Command+Q',
          click() {
            app.quit()
          }
        }
      ]
    })
    template[2].submenu.push({ type: 'separator' })
    template[2].submenu.push({
      label: translate('AppMenu Bring All to Front'),
      role: 'front'
    })
  }

  return Menu.buildFromTemplate(template)
}
