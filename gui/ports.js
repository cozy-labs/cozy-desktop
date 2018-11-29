'use strict'

const electron = require('electron')
const {ipcRenderer, remote} = electron

window.onerror = (message, url, line, column, err) => {
  ipcRenderer.send('renderer-error', {message, stack: err.stack})
}

const pkg = remote.require('../package.json')
const defaults = remote.require('./js/defaults')

const container = document.getElementById('container')

const { Elm } = require('./elm')
const elmectron = Elm.Main.init({
  node: container,
  flags: {
    hash: window.location.hash,
    folder: defaults.syncPath,
    locale: remote.app.locale,
    locales: {
      en: remote.require('./locales/en.json'),
      es: remote.require('./locales/es.json'),
      fr: remote.require('./locales/fr.json')
    },
    platform: remote.process.platform,
    version: pkg.version
  }
})

const errMessage = (err) => {
  if (!err) {
    return null
  } else if (err.code === 'ENOTFOUND') {
    return "The host can't be found"
  } else if (err.message) {
    return err.message
  } else {
    return `${err}`
  }
}

ipcRenderer.on('update-downloading', (event, progressObj) => {
  elmectron.ports.updateDownloading.send(progressObj)
})

ipcRenderer.on('update-error', (event, err) => {
  elmectron.ports.updateError.send(err)
})

ipcRenderer.on('registration-error', (event, err) => {
  err = errMessage(err)
  elmectron.ports.registrationError.send(err)
})
ipcRenderer.on('registration-done', (event) => {
  elmectron.ports.registrationDone.send(true)
})
elmectron.ports.registerRemote.subscribe((url) => {
  ipcRenderer.send('register-remote', {
    cozyUrl: url,
    location: window.location.toString().replace('#', '')
  })
})

ipcRenderer.on('folder-chosen', (event, result) => {
  elmectron.ports.folder.send(result)
})
ipcRenderer.on('folder-error', (event, err) => {
  elmectron.ports.folderError.send(err)
})
elmectron.ports.chooseFolder.subscribe(() => {
  ipcRenderer.send('choose-folder')
})

ipcRenderer.on('synchronization', (event, url, deviceName) => {
  elmectron.ports.synchonization.send([url, deviceName])
})
elmectron.ports.startSync.subscribe((folder) => {
  ipcRenderer.send('start-sync', folder)
})

elmectron.ports.manualStartSync.subscribe(() => {
  ipcRenderer.send('manual-start-sync')
})

ipcRenderer.on('new-release-available', (event, notes, name) => {
  console.log('new-release-available', notes, name)
  elmectron.ports.newRelease.send([notes, name])
})
elmectron.ports.quitAndInstall.subscribe(() => {
  ipcRenderer.send('quit-and-install')
})
elmectron.ports.gotocozy.subscribe(() => {
  ipcRenderer.send('go-to-cozy')
})
elmectron.ports.gotofolder.subscribe(() => {
  ipcRenderer.send('go-to-folder')
})

elmectron.ports.closeApp.subscribe(() => {
  ipcRenderer.send('close-app')
})

ipcRenderer.on('auto-launch', (event, enabled) => {
  elmectron.ports.autolaunch.send(enabled)
})
elmectron.ports.autoLauncher.subscribe((enabled) => {
  ipcRenderer.send('auto-launcher', enabled)
})

ipcRenderer.on('go-to-tab', (event, tab) => {
  elmectron.ports.gototab.send(tab)
})

ipcRenderer.on('cancel-unlink', (event) => {
  elmectron.ports.cancelUnlink.send(true)
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

elmectron.ports.openFile.subscribe((path) => {
  ipcRenderer.send('open-file', path)
})

ipcRenderer.on('offline', () => {
  elmectron.ports.offline.send(true)
})

ipcRenderer.on('remoteWarnings', (event, warnings) => {
  elmectron.ports.remoteWarnings.send(warnings)
})

ipcRenderer.on('user-action-required', (event, userActionRequired) => {
  elmectron.ports.userActionRequired.send(userActionRequired)
})

elmectron.ports.userActionInProgress.subscribe(() => {
  ipcRenderer.send('userActionInProgress')
})

ipcRenderer.on('up-to-date', () => {
  elmectron.ports.updated.send(true)
})

ipcRenderer.on('sync-status', (event, {label, remaining}) => {
  switch (label) {
    case 'sync':
      elmectron.ports.syncing.send(remaining)
      break
    case 'squashprepmerge':
      elmectron.ports.squashPrepMerge.send(true)
      break
    case 'buffering':
      elmectron.ports.buffering.send(true)
      break
    case 'uptodate':
      elmectron.ports.updated.send(true)
      break
  }
})

ipcRenderer.on('transfer', (event, info) => {
  elmectron.ports.transfer.send(info)
})
ipcRenderer.on('delete-file', (event, info) => {
  elmectron.ports.remove.send(info)
})

ipcRenderer.on('disk-space', (event, info) => {
  elmectron.ports.diskSpace.send(info)
})

ipcRenderer.on('sync-error', (event, err) => {
  elmectron.ports.syncError.send(err)
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

elmectron.ports.showHelp.subscribe(() => {
  ipcRenderer.send('show-help')
})

// Chrome-like "inspect element" for Electron
if (process.env.WATCH === 'true' || process.env.DEBUG === 'true') {
  // eslint-disable-next-line node/no-unpublished-require
  const debugMenu = require('debug-menu')
  debugMenu.install()
  window.elmectron = elmectron
}
