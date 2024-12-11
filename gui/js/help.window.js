/* @flow */

const { enable: enableRemoteModule } = require('@electron/remote/main')

const WindowManager = require('./window_manager')
const log = require('../../core/app').logger({
  component: 'GUI'
})

/*::
import type { Event as ElectronEvent } from 'electron'
*/

const HELP_SCREEN_WIDTH = 768
const HELP_SCREEN_HEIGHT = 570

module.exports = class HelpWM extends WindowManager {
  windowOptions() {
    return {
      title: 'HELP',
      width: HELP_SCREEN_WIDTH,
      height: HELP_SCREEN_HEIGHT
    }
  }

  create() {
    super.create()

    enableRemoteModule(this.win.webContents)
  }

  hash() {
    return '#help'
  }

  ipcEvents() {
    let that = this
    return {
      'send-mail': (event /*: ElectronEvent */, body /*: string */) => {
        that.desktop
          .sendMailToSupport(body)
          .then(() => {
            event.sender.send('mail-sent')
            return
          })
          .catch(err => {
            log.error('failed sending mail to support', { err, sentry: true })
            if (event.sender) {
              event.sender.send('mail-sent', {
                message: 'Help An error occured while sending your email'
              })
            }
          })
      }
    }
  }
}
