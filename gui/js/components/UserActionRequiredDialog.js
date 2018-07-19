const { dialog } = require('electron')
const opn = require('opn')
const path = require('path')
const { translate } = require('../i18n')
const { logger } = require('../../../core/app')

const log = logger({
  component: 'UserActionRequiredDialog'
})

const imgs = path.resolve(__dirname, '..', '..', 'images')

module.exports = {
  show
}

function show (err) {
  const userChoice = dialog.showMessageBox(null, options(err))
  if (userChoice === 0) opn(err.links.self)
  else log.warn({userChoice}, 'Unexpected user choice')
}

function options (err) {
  const icon = `${imgs}/icon.png`

  // Same logic as gui/elm/UserActionRequiredPage.elm
  if (err.code === 'tos-updated') {
    return {
      icon,
      title: translate('UserActionRequiredDialog Title'),
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
      icon,
      title: err.title,
      message: err.message,
      detail: err.detail,
      buttons: [
        translate('Error Ok')
      ]
    }
  }
}
