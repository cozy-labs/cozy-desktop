/* @flow */

const path = require('path')

const { enable: enableRemoteModule } = require('@electron/remote/main')

const { buildTranslations } = require('./i18n')
const WindowManager = require('./window_manager')
const log = require('../../core/app').logger({
  component: 'GUI'
})

const SCREEN_WIDTH = 750
const SCREEN_HEIGHT = 800

/*::
import type { UserAlert } from '../../core/syncstate'
*/

module.exports = class DetailsWM extends WindowManager {
  windowOptions() {
    return {
      title: 'Details',
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      useContentSize: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      indexPath: path.resolve(__dirname, '..', 'details.html')
    }
  }

  create() {
    super.create()

    enableRemoteModule(this.win.webContents)
  }

  hash() {
    return '#details'
  }

  ipcEvents() {
    return {}
  }

  translations() {
    return buildTranslations([
      'InvalidDoc Naming rules for each Operating System',
      'InvalidDoc Windows restrictions',
      'InvalidDoc macOS restrictions',
      'InvalidDoc GNU/Linux restrictions',
      'InvalidDoc File names, extension included, cannot be more than 256 characters long.',
      'InvalidDoc Folder names cannot be more than 243 characters long.',
      'InvalidDoc Document names, extension included, cannot be more than {0} characters long.',
      "InvalidDoc Document paths (i.e. document name + all its ancestors' names) cannot be more than {0} characters long.",
      'InvalidDoc Document names cannot include the following characters: ',
      'InvalidDoc Folder names and file extensions cannot end with the following characters: ',
      'InvalidDoc The following document names are forbidden: '
    ])
  }

  loadContent(alert /*: UserAlert */) {
    log.info('loading user alert details', { alert })
    if (alert.code === 'IncompatibleDoc') {
      this.win.webContents.send('load-content', {
        translations: this.translations(),
        alert
      })
    }
  }

  on(event /*: Event */, handler /*: Function */) {
    this.win.on(event, handler)
  }
}
