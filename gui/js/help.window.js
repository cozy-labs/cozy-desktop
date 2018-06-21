const WindowManager = require('./window_manager')
const HELP_SCREEN_WIDTH = 768
const HELP_SCREEN_HEIGHT = 570

const log = require('../../core/app').logger({
  component: 'GUI'
})

module.exports = class TrayWM extends WindowManager {
  windowOptions () {
    return {
      title: 'HELP',
      width: HELP_SCREEN_WIDTH,
      height: HELP_SCREEN_HEIGHT
    }
  }

  hash () {
    return '#help'
  }

  ipcEvents () {
    let that = this
    return {
      'send-mail': (event, body) => {
        that.desktop.sendMailToSupport(body).then(
          () => { event.sender.send('mail-sent') },
          (err) => {
            log.error({err})
            event.sender.send('mail-sent', {
              message: 'Help An error occured while sending your email'
            })
          }
        )
      }
    }
  }
}
