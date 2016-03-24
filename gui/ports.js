'use strict'
/* global Elm */ // This will keep your linter happy

const shell = require('electron').shell
const ipcRenderer = require('electron').ipcRenderer

const container = document.getElementById('container')
const elmectron = Elm.embed(Elm.Main, container)

console.log(elmectron.ports, ipcRenderer)

// Open external links in the browser
document.addEventListener('click', (event) => {
  if (event.target.matches('a[href^="http"]')) {
    event.preventDefault()
    shell.openExternal(event.target.href)
  }
})
