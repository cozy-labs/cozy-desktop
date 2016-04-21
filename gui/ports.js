'use strict'
/* global Elm */

const ipcRenderer = require('electron').ipcRenderer
const remote = require('remote')
const shell = require('electron').shell

const path = remote.require('path-extra')
const pkg = remote.require('./package.json')
const defaultDir = path.join(path.homedir(), 'Cozy')
const container = document.getElementById('container')

const elmectron = Elm.embed(Elm.Main, container, {
  folder: '',
  gototab: '',
  mail: '',
  pong: null,
  registration: null,
  remove: { filename: '', icon: '', path: '', size: 0, updated: 0 },
  synchonization: '',
  transfer: { filename: '', icon: '', path: '', size: 0, updated: 0 },
  unlink: [],
  updated: [],
  version: pkg.version
})

const errMessage = (err) => (err && err.message) ? err.message : err

// Glue code between Elm and the main process
ipcRenderer.on('cozy-pong', (event, url) => {
  elmectron.ports.pong.send(url)
})
elmectron.ports.pingCozy.subscribe((url) => {
  ipcRenderer.send('ping-cozy', url)
})

ipcRenderer.on('remote-registered', (event, err) => {
  err = errMessage(err)
  elmectron.ports.registration.send(err)
})
elmectron.ports.registerRemote.subscribe((remote) => {
  ipcRenderer.send('register-remote', {
    url: remote[0],
    password: remote[1]
  })
})

elmectron.ports.folder.send(defaultDir)
ipcRenderer.on('folder-chosen', (event, folder) => {
  elmectron.ports.folder.send(folder)
})
elmectron.ports.chooseFolder.subscribe(() => {
  ipcRenderer.send('choose-folder')
})

ipcRenderer.on('synchronization', (event, url) => {
  elmectron.ports.synchonization.send(url)
})
elmectron.ports.startSync.subscribe((folder) => {
  ipcRenderer.send('start-sync', folder)
})

ipcRenderer.on('go-to-tab', (event, tab) => {
  elmectron.ports.gototab.send(tab)
})

ipcRenderer.on('unlinked', (event) => {
  elmectron.ports.unlink.send([])
})
elmectron.ports.unlinkCozy.subscribe(() => {
  ipcRenderer.send('unlink-cozy')
})

ipcRenderer.on('mail-sent', (event, err) => {
  err = errMessage(err)
  elmectron.ports.mail.send(err)
})
elmectron.ports.sendMail.subscribe((body) => {
  ipcRenderer.send('send-mail', body)
})

ipcRenderer.on('up-to-date', () => {
  elmectron.ports.updated.send([])
})

ipcRenderer.on('transfer', (event, info) => {
  elmectron.ports.transfer.send(info)
})
ipcRenderer.on('delete-file', (event, info) => {
  elmectron.ports.remove.send(info)
})

// Open external links in the browser
function tryToOpenExternalLink (event, target) {
  if (target && target.matches('a[href^="https"]')) {
    event.preventDefault()
    shell.openExternal(target.href)
  }
}
document.addEventListener('click', (event) => {
  tryToOpenExternalLink(event, event.target)
  tryToOpenExternalLink(event, event.target.parentElement)
})

// Give focus to DOM nodes
elmectron.ports.focus.subscribe((selector) => {
  // We wait that the CSS transition has finished before focusing the node
  setTimeout(() => {
    const nodes = document.querySelectorAll(selector)
    if (nodes && nodes.length > 0) {
      nodes[0].focus()
    }
  }, 300)
})
