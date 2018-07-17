const { dialog } = require('electron')
const opn = require('opn')
const { translate } = require('../i18n')
const { logger } = require('../../../core/app')

const log = logger({
  component: 'UserActionRequiredDialog'
})

module.exports = {
  show
}

function show (err) {
  const userChoice = dialog.showMessageBox(null, options(err))
  if (userChoice === 0) opn(err.links.self)
  else log.warn({userChoice}, 'Unexpected user choice')
}

function options (err) {
  const type = 'warning'

  // Same logic as gui/elm/UserActionRequiredPage.elm
  if (err.code === 'tos-updated') {
    return {
      type,
      title: translate('CGU Updated'),
      message: translate('CGU Updated'),
      detail: [
        'CGU Updated Detail',
        'CGU Updated Required strong',
        'CGU Updated Required rest'
      ].map(translate).join('. '),
      buttons: [
        translate('CGU Updated See')
      ]
    }
  } else {
    return {
      type,
      title: err.title,
      message: err.message,
      detail: err.detail,
      buttons: [
        translate('Error Ok')
      ]
    }
  }
}
