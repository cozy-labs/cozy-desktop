'use strict'
/* global Elm */ // This will keep your linter happy

const ipcRenderer = require('electron').ipcRenderer

const container = document.getElementById('container')
const elmectron = Elm.embed(Elm.Main, container)

console.log(elmectron.ports, ipcRenderer)
