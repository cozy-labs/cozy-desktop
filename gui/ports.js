/* @flow */

'use strict'

const electron = require('electron')
const { ipcRenderer } = electron
const remote = require('@electron/remote')

/*::
import type { SyncStatus, UserAlert, SyncError } from '../core/syncstate'
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
  } else if (typeof err.message === 'string') {
    return err.message
  } else {
    return `${err}`
  }
}

elmectron.ports.confirm.subscribe(confirmation => {
  ipcRenderer.send('confirm', confirmation)
})
ipcRenderer.on('confirmation', (event, { id, confirmed }) => {
  elmectron.ports.confirmations.send([id, confirmed])
})

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

ipcRenderer.on(
  'sync-config',
  (event, address, deviceName, deviceId, capabilities, flags) => {
    const partialSyncEnabled =
      flags['settings.partial-desktop-sync.show-synced-folders-selection']
    const flatSubdomains = capabilities.flatSubdomains
    elmectron.ports.syncConfig.send({
      address,
      deviceName,
      deviceId,
      capabilities: {
        flatSubdomains: flatSubdomains != null ? flatSubdomains : true
      },
      flags: {
        partialSyncEnabled:
          partialSyncEnabled != null ? partialSyncEnabled : false
      }
    })
  }
)
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
elmectron.ports.gotocozy.subscribe(showInWeb => {
  ipcRenderer.send('go-to-cozy', showInWeb)
})
elmectron.ports.gotofolder.subscribe(showInWeb => {
  ipcRenderer.send('go-to-folder', showInWeb)
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

elmectron.ports.reinitializeSynchronization.subscribe(() => {
  ipcRenderer.send('reinitialize-synchronization')
})
ipcRenderer.on('reinitialization', (event, status) => {
  elmectron.ports.reinitialization.send(status)
})

ipcRenderer.on('mail-sent', (event, err) => {
  err = errMessage(err)
  elmectron.ports.mail.send(err)
})
elmectron.ports.sendMail.subscribe(body => {
  ipcRenderer.send('send-mail', body)
})

elmectron.ports.openFile.subscribe(([path, showInWeb]) => {
  ipcRenderer.send('open-file', path, showInWeb)
})

elmectron.ports.showInParent.subscribe(([path, showInWeb]) => {
  ipcRenderer.send('show-in-parent', path, showInWeb)
})

elmectron.ports.userAlertDetails.subscribe(action => {
  ipcRenderer.send('userAlertDetails', action)
})

elmectron.ports.userActionInProgress.subscribe(action => {
  ipcRenderer.send('userActionInProgress', action)
})

elmectron.ports.userActionCommand.subscribe(([cmd, action]) => {
  ipcRenderer.send('userActionCommand', cmd, action)
})

ipcRenderer.on('sync-state', (
  event,
  newState /*: { status: SyncStatus, remaining: number, userAlerts: UserAlert[], errors: SyncError[] } */
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
