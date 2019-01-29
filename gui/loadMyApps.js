/* eslint-disable no-unused-vars */
const React = require('react')
const ReactDOM = require('react-dom')

class HelloMessage extends React.Component {
  render () {
    return (
      React.createElement('div', null, 'Hello from React', null)
    )
  }
}

function initApp (anchorID) {
  // init cozy-client

  ReactDOM.render(
    React.createElement(HelloMessage, {}), document.getElementById(anchorID)
  )
}

module.exports = myAppsAnchorID => {
  window.requestAnimationFrame(timestamp => initApp(myAppsAnchorID))
}
