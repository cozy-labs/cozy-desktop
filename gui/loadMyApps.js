/* eslint-disable no-unused-vars */
const React = require('react')
const ReactDOM = require('react-dom')
const os = require('os')
const path = require('path')

const Config = require('../core/config')
const { RemoteCozy } = require('../core/remote/cozy')

let cpt = 0
class DummyCozyHome extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      apps: []
    }
  }

  componentDidMount () {
    this.props.cozyClient.fetchJSON('GET', '/apps/', null, {})
      .then((apps) => {
        this.setState(state => Object.assign({}, state, { apps: apps }))
      }).catch(console.log)
  }

  render () {
    if (this.state.apps.length === 0) {
      return React.createElement(
        'p',
        null,
        'Loading…',
        null)
    } else {
      return (
        React.createElement(
          'ul',
          null,
          this.state.apps.map(app => React.createElement(
            'li',
            { key: app._id },
            app.attributes.name
          ))
        )
      )
    }
  }
}

function initApp (anchorID) {
  // init cozy-client
  const cozyDesktopDir = process.env.COZY_DESKTOP_DIR || path.resolve(os.homedir())
  const basePath = path.join(cozyDesktopDir, '.cozy-desktop')
  const config = new Config(basePath)
  const cozyClient = new RemoteCozy(config)

  ReactDOM.render(
    React.createElement(DummyCozyHome, {
      cozyClient: cozyClient.client
    }), document.getElementById(anchorID)
  )
}

module.exports = myAppsAnchorID => {
  window.requestAnimationFrame(timestamp => initApp(myAppsAnchorID))
}
