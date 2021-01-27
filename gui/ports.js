'use strict'

const electron = require('electron')
const { ipcRenderer, remote } = electron

/*::
import type { SyncStatus } from '../core/syncstate'
*/

window.onerror = (message, url, line, column, err) => {
  ipcRenderer.send('renderer-error', { message, stack: err.stack })
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

const errMessage = err => {
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
ipcRenderer.on('registration-done', () => {
  elmectron.ports.registrationDone.send(true)
})
elmectron.ports.registerRemote.subscribe(url => {
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
elmectron.ports.startSync.subscribe(folder => {
  ipcRenderer.send('start-sync', folder)
})

elmectron.ports.manualStartSync.subscribe(() => {
  ipcRenderer.send('manual-start-sync')
})

ipcRenderer.on('new-release-available', (event, notes, name) => {
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
elmectron.ports.autoLauncher.subscribe(enabled => {
  ipcRenderer.send('auto-launcher', enabled)
})

ipcRenderer.on('go-to-tab', (event, tab) => {
  elmectron.ports.gototab.send(tab)
})

ipcRenderer.on('cancel-unlink', () => {
  elmectron.ports.cancelUnlink.send(true)
})
elmectron.ports.unlinkCozy.subscribe(() => {
  ipcRenderer.send('unlink-cozy')
})

ipcRenderer.on('mail-sent', (event, err) => {
  err = errMessage(err)
  elmectron.ports.mail.send(err)
})
elmectron.ports.sendMail.subscribe(body => {
  ipcRenderer.send('send-mail', body)
})

elmectron.ports.openFile.subscribe(path => {
  ipcRenderer.send('open-file', path)
})

elmectron.ports.userActionDone.subscribe(action => {
  ipcRenderer.send('userActionDone', action)
})

elmectron.ports.userActionInProgress.subscribe(action => {
  ipcRenderer.send('userActionInProgress', action)
})

elmectron.ports.userActionSkipped.subscribe(action => {
  ipcRenderer.send('userActionSkipped', action)
})

ipcRenderer.on('sync-state', (
  event,
  newState /*: { status: SyncStatus, remaining: number, userActions: UserAction[] } */
) => {
  elmectron.ports.syncState.send(newState)
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
elmectron.ports.focus.subscribe(selector => {
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
