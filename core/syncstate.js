/**
 * @module core/syncstate
 * @flow
 */

const autoBind = require('auto-bind')
const EventEmitter = require('events')
const deepDiff = require('deep-diff').diff

/*::
type State = {
  offline: boolean,
  syncTargetSeq: number,
  syncCurrentSeq: number,
  remaining: number,
  buffering: boolean,
  syncing: boolean,
  localPrep: boolean,
  remotePrep: boolean,
}

export type SyncStatus =
  | 'buffering'
  | 'squashprepmerge'
  | 'offline'
  | 'sync'
  | 'uptodate'
*/

module.exports = class SyncState extends EventEmitter {
  /*::
  state: State
  */

  constructor() {
    super()

    this.state = {
      offline: false,
      syncTargetSeq: -1,
      syncCurrentSeq: -1,
      remaining: 0,
      buffering: false,
      syncing: false,
      localPrep: false,
      remotePrep: false
    }

    autoBind(this)
  }

  emitStatus() {
    const {
      offline,
      remaining,
      buffering,
      syncing,
      localPrep,
      remotePrep
    } = this.state

    const status /*: SyncStatus */ = offline
      ? 'offline'
      : syncing
      ? 'sync'
      : buffering
      ? 'buffering'
      : localPrep || remotePrep
      ? 'squashprepmerge'
      : 'uptodate'

    super.emit('sync-state', { status, remaining })
  }

  update(newState /*: $Shape<State> */) {
    const { state } = this

    const syncCurrentSeq = newState.syncCurrentSeq || state.syncCurrentSeq
    const syncTargetSeq = newState.syncTargetSeq || state.syncTargetSeq
    const remaining =
      // If the current or target sequence have changed
      (syncCurrentSeq !== state.syncCurrentSeq ||
        syncTargetSeq !== state.syncTargetSeq) &&
      // And we've merged some changes already
      state.syncTargetSeq !== -1
        ? // If the sync process has been started at least once
          state.syncCurrentSeq !== -1
          ? Math.max(syncTargetSeq - syncCurrentSeq, 0)
          : // Else we're buffering changes to be synced
            state.remaining + 1
        : // Otherwise the remaining number of changes is still the same
          state.remaining

    newState = {
      ...state,
      ...newState,
      remaining
    }

    const diff = deepDiff(state, newState)
    if (diff) {
      // Limit the number of events sent to the Electron window
      this.state = newState
      this.emitStatus()
    }
  }

  emit(name /*: string */, ...args /*: any[] */) /*: boolean */ {
    switch (name) {
      case 'online':
        this.update({ offline: false })
        break
      case 'offline':
        this.update({ offline: true })
        break
      case 'buffering-start':
        this.update({ buffering: true })
        break
      case 'buffering-end':
        this.update({ buffering: false })
        break
      case 'local-start':
        this.update({ localPrep: true })
        break
      case 'remote-start':
        this.update({ remotePrep: true })
        break
      case 'sync-start':
        this.update({
          localPrep: false,
          remotePrep: false,
          syncing: true
        })
        break
      case 'local-end':
        this.update({ localPrep: false })
        break
      case 'remote-end':
        this.update({ remotePrep: false })
        break
      case 'sync-end':
        this.update({ syncing: false })
        break
      case 'sync-target':
        if (typeof args[0] === 'number') {
          this.update({ syncTargetSeq: args[0] })
        }
        break
      case 'sync-current':
        if (typeof args[0] === 'number') {
          this.update({ syncCurrentSeq: args[0] })
        }
        break
    }

    return super.emit(name, ...args)
  }
}
