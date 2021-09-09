/**
 * @module core/syncstate
 * @flow
 */

const autoBind = require('auto-bind')
const EventEmitter = require('events')
const deepDiff = require('deep-diff').diff

/*::
type UserActionStatus = 'Required'|'InProgress'
export type UserActionCommand =
  | 'retry'
  | 'skip'
  | 'create-conflict'
  | 'link-directories'
export type UserAction = {
  seq: ?number,
  code: string,
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
  userActions: UserAction[],
  errors: SyncError[]
}

export type SyncStatus =
  | 'buffering'
  | 'squashprepmerge'
  | 'offline'
  | 'syncing'
  | 'uptodate'
  | 'user-action-required'
  | 'error'

export type SyncError = {|
  name: string,
  code: string,
|}
*/

const makeAction = (
  err /*: Object */,
  seq /*: ?number */
) /*: UserAction */ => {
  const { doc } = err
  const links = err.links || (err.originalErr && err.originalErr.links)

  return {
    seq: err.seq || seq || null,
    status: 'Required',
    code: err.code,
    doc: doc || null,
    links: links || null
  }
}

const addAction = (
  actions /*: UserAction[] */,
  newAction /*: UserAction */
) /*: UserAction[] */ => {
  const existingAction = actions.find(action => action.code === newAction.code)
  if (existingAction) {
    existingAction.status = 'Required'
    return actions
  } else {
    return actions.concat(newAction)
  }
}

const updateAction = (
  actions /*: UserAction[] */,
  action /*: UserAction */,
  status /*: UserActionStatus */
) /*: UserAction[] */ => {
  return actions.reduce((prev, curr) => {
    if (curr.code === action.code) {
      return prev.concat({ ...action, status })
    } else {
      return prev.concat(curr)
    }
  }, [])
}

const removeAction = (
  actions /*: UserAction[] */,
  action /*: UserAction */
) /*: UserAction[] */ => {
  return actions.filter(a => a.code !== action.code)
}

const makeError = (err /*: Object */) /*: SyncError */ => {
  const { name, code } = err

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
      userActions: [],
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
      userActions,
      errors
    } = this.state

    const status /*: SyncStatus */ =
      errors.length > 0
        ? 'error'
        : userActions.length > 0
        ? 'user-action-required'
        : offline
        ? 'offline'
        : syncing
        ? 'syncing'
        : buffering
        ? 'buffering'
        : localPrep || remotePrep
        ? 'squashprepmerge'
        : 'uptodate'

    super.emit('sync-state', { status, remaining, userActions, errors })
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

    const updatedUserActions = newState.userActions || state.userActions
    const userActions =
      newState.syncCurrentSeq != null
        ? updatedUserActions.reduce((actions, action) => {
            if (action.seq && action.seq <= newState.syncCurrentSeq) {
              return actions
            } else {
              return actions.concat(action)
            }
          }, [])
        : updatedUserActions

    newState = {
      ...state,
      ...newState,
      remaining,
      userActions
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
        this.update({ errors: addError(this.state.errors, makeError(...args)) })
        break
      case 'user-action-required':
        this.update({
          userActions: addAction(this.state.userActions, makeAction(...args))
        })
        break
      case 'user-action-inprogress':
        this.update({
          userActions: updateAction(
            this.state.userActions,
            makeAction(args[0]),
            'InProgress'
          )
        })
        break
      case 'user-action-done':
        this.update({
          userActions: removeAction(this.state.userActions, makeAction(...args))
        })
        break
    }

    return super.emit(name, ...args)
  }
}
