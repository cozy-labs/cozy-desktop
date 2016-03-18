const ipcRenderer = require('electron').ipcRenderer

document.getElementById('save').addEventListener('click', () => {
  ipcRenderer.send('add-remote', {
    url: document.getElementById('url').value,
    folder: document.getElementById('folder').value,
    password: document.getElementById('password').value
  })
})

ipcRenderer.on('remote-added', (event, arg) => {
  console.log('remote-added', arg)
})
