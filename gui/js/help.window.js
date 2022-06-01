const WindowManager = require('./window_manager')
const { enable: enableRemoteModule } = require('@electron/remote/main')

const HELP_SCREEN_WIDTH = 768
const HELP_SCREEN_HEIGHT = 570

const log = require('../../core/app').logger({
  component: 'GUI'
})

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
      'send-mail': (event, body) => {
        that.desktop
          .sendMailToSupport(body)
          .then(() => {
            event.sender.send('mail-sent')
            return
          })
          .catch(err => {
            log.error({ err, sentry: true }, 'failed sending mail to support')
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
