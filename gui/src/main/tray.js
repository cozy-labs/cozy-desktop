const electron = require('electron')
const imgs = `${__dirname}/../../images`

let tray = null

module.exports.init = (action) => {
  tray = new electron.Tray(`${imgs}/tray-icon-linux/idle.png`)
  tray.on('click', action)
  tray.on('right-click', action)
  tray.on('double-click', action)
}

module.exports.setState = (state) => {
  if (process.platform === 'darwin') {
    tray.setImage(`${imgs}/tray-icon-osx/${state}Template.png`)
    tray.setPressedImage(`${imgs}/tray-icon-osx/${state}Highlight.png`)
  } else {
    tray.setImage(`${imgs}/tray-icon-linux/${state}.png`)
  }
}
