/**
 * @module core/syncstate
 * @flow
 */

const EventEmitter = require('events')

const autoBind = require('auto-bind')
const deepDiff = require('deep-diff').diff

/*::
import type { SideName } from './side'

type UserActionStatus = 'Required'|'InProgress'
export type UserActionCommand =
  | 'retry'
  | 'skip'
  | 'create-conflict'
  | 'link-directories'
export type UserAlert = {
  seq: ?number,
  code: string,
  side: ?SideName,
  doc?: {
    docType: string,
    path: string,
  },
  links: ?{ self: string },
  status: UserActionStatus
}

type State = {
  offline: boolean,
  syncTargetSeq: number,
  syncCurrentSeq: number,
  remaining: number,
  buffering: boolean,
  syncing: boolean,
  localPrep: boolean,
  remotePrep: boolean,
  userAlerts: UserAlert[],
  errors: SyncError[]
}

export type SyncStatus =
  | 'buffering'
  | 'squashprepmerge'
  | 'offline'
  | 'syncing'
  | 'uptodate'
  | 'user-alert'
  | 'error'

export type SyncError = {|
  name: string,
  code: string,
|}
*/

const makeAlert = (
  err /*: Object */,
  seq /*: ?number */,
  side /*: ?SideName */
) /*: UserAlert */ => {
  const { doc } = err
  const links = err.links || (err.originalErr && err.originalErr.links)

  return {
    seq: err.seq || seq || null,
    status: 'Required',
    code: err.code,
    side: side || null,
    doc: doc || null,
    links: links || null
  }
}

const addAlert = (
  alerts /*: UserAlert[] */,
  newAlert /*: UserAlert */
) /*: UserAlert[] */ => {
  const existingAlert = alerts.find(alert => alert.code === newAlert.code)
  if (existingAlert) {
    existingAlert.status = 'Required'
    return alerts
  } else {
    return alerts.concat(newAlert)
  }
}

const updateAlert = (
  alerts /*: UserAlert[] */,
  alert /*: UserAlert */,
  status /*: UserActionStatus */
) /*: UserAlert[] */ => {
  return alerts.reduce((prev /*: UserAlert[] */, curr /*: UserAlert */) => {
    if (curr.code === alert.code) {
      return prev.concat({ ...alert, status })
    } else {
      return prev.concat(curr)
    }
  }, [])
}

const removeAlert = (
  alerts /*: UserAlert[] */,
  alert /*: UserAlert */
) /*: UserAlert[] */ => {
  return alerts.filter(a => a.code !== alert.code)
}

const makeError = (err /*: Object */) /*: SyncError */ => {
  const { name = '', code = '' } = err

  return {
    name,
    code
  }
}

const addError = (
  errors /*: SyncError[] */,
  newError /*: SyncError */
) /*: SyncError[] */ => {
  const existingError = errors.find(error => error.code === error.code)
  if (existingError) {
    return errors
  } else {
    return errors.concat(newError)
  }
}

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
      remotePrep: false,
      userAlerts: [],
      errors: []
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
      remotePrep,
      userAlerts,
      errors
    } = this.state

    const status /*: SyncStatus */ =
      errors.length > 0
        ? 'error'
        : userAlerts.length > 0
        ? 'user-alert'
        : offline
        ? 'offline'
        : syncing
        ? 'syncing'
        : buffering
        ? 'buffering'
        : localPrep || remotePrep
        ? 'squashprepmerge'
        : 'uptodate'

    super.emit('sync-state', { status, remaining, userAlerts, errors })
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

    const updatedUserAlerts = newState.userAlerts || state.userAlerts
    const userAlerts =
      newState.syncCurrentSeq != null
        ? updatedUserAlerts.reduce((
            alerts /*: UserAlert[] */,
            alert /*: UserAlert */
          ) => {
            if (alert.seq && alert.seq <= newState.syncCurrentSeq) {
              return alerts
            } else {
              return alerts.concat(alert)
            }
          }, [])
        : updatedUserAlerts

    newState = {
      ...state,
      ...newState,
      remaining,
      userAlerts
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
      case 'Sync:fatal':
        this.update({
          errors: addError(this.state.errors, makeError(...args))
        })
        break
      case 'user-alert':
        this.update({
          userAlerts: addAlert(this.state.userAlerts, makeAlert(...args))
        })
        break
      case 'user-action-inprogress':
        this.update({
          userAlerts: updateAlert(
            this.state.userAlerts,
            makeAlert(args[0]),
            'InProgress'
          )
        })
        break
      case 'user-action-done':
        this.update({
          userAlerts: removeAlert(this.state.userAlerts, makeAlert(...args))
        })
        break
    }

    return super.emit(name, ...args)
  }
}
