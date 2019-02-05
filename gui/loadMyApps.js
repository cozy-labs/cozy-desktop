/* eslint-disable node/no-unpublished-require */
/* eslint-disable no-unused-vars */
const React = require('react')
const ReactDOM = require('react-dom')
const os = require('os')
const path = require('path')

const Config = require('../core/config')
const { RemoteCozy } = require('../core/remote/cozy')
const {
  initCozyHomeForDesktop
} = require('../../cozy-home/build/cozy-home-for-desktop.js')

function initApp ({ token, uri }, anchorID) {
  const cozyDesktopDir =
    process.env.COZY_DESKTOP_DIR || path.resolve(os.homedir())
  const basePath = path.join(cozyDesktopDir, '.cozy-desktop')
  const config = new Config(basePath)
  const { client: cozy } = new RemoteCozy(config)

  initCozyHomeForDesktop(
    { token, uri, lang: 'en', cozy },
    document.getElementById(anchorID)
  )
}

module.exports = myAppsAnchorID => {
  const cozyDesktopDir =
    process.env.COZY_DESKTOP_DIR || path.resolve(os.homedir())
  const basePath = path.join(cozyDesktopDir, '.cozy-desktop')
  const config = new Config(basePath)
  const {
    config: {
      url: uri,
      creds: {
        token: { accessToken: token }
      }
    }
  } = config

  window.requestAnimationFrame(timestamp =>
    initApp({ token, uri }, myAppsAnchorID)
  )
}
