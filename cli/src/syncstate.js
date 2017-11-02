let syncSyncing = false
let localSyncing = false
let remoteSyncing = false

export const onLocalStart = (events) => {
  let was = localSyncing || syncSyncing || remoteSyncing
  localSyncing = true
  if (!was) events.emit('syncing')
}

export const onRemoteStart = (events) => {
  let was = localSyncing || syncSyncing || remoteSyncing
  remoteSyncing = true
  if (!was) events.emit('syncing')
}

export const onSyncStart = (events) => {
  let was = localSyncing || syncSyncing || remoteSyncing
  syncSyncing = true
  if (!was) events.emit('syncing')
}

export const onLocalEnd = (events) => {
  localSyncing = false
  if (!(localSyncing || syncSyncing || remoteSyncing)) {
    events.emit('up-to-date')
  }
}

export const onRemoteEnd = (events) => {
  remoteSyncing = false
  if (!(localSyncing || syncSyncing || remoteSyncing)) {
    events.emit('up-to-date')
  }
}

export const onSyncEnd = (events) => {
  syncSyncing = false
  if (!(localSyncing || syncSyncing || remoteSyncing)) {
    events.emit('up-to-date')
  }
}
