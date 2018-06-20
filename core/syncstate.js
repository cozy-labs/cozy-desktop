const autoBind = require('auto-bind')
const EventEmitter = require('events')

module.exports = class SyncState extends EventEmitter {
  /*::
  syncLastSeq: number
  syncCurrentSeq: number
  buffering: boolean
  syncSyncing: boolean
  localSyncing: boolean
  remoteSyncing: boolean
  */

  constructor () {
    super()
    autoBind(this)
  }

  shouldSpin () {
    return this.localSyncing || this.remoteSyncing || this.syncSyncing
  }

  emitStatus () {
    const label = this.syncSyncing ? 'sync'
                   : (this.localSyncing || this.remoteSyncing) ? 'squashprepmerge'
                   : this.buffering ? 'buffering'
                   : 'uptodate'

    super.emit('sync-status', {
      label: label,
      remaining: Math.max(1, this.syncLastSeq - this.syncCurrentSeq)
    })

    if (this.wasSpinning && !this.shouldSpin()) {
      this.emit('up-to-date')
    }

    if (this.shouldSpin() && !this.wasSpinning) {
      this.emit('syncing')
    }
  }

  emit (name, ...args) {
    this.wasSpinning = this.shouldSpin()
    switch (name) {
      case 'buffering-start':
        this.buffering = true
        this.emitStatus()
        break
      case 'buffering-end':
        this.buffering = false
        this.emitStatus()
        break
      case 'local-start':
        this.localSyncing = true
        this.emitStatus()
        break
      case 'remote-start':
        this.remoteSyncing = true
        this.emitStatus()
        break
      case 'sync-start':
        this.syncSyncing = true
        this.emitStatus()
        break
      case 'local-end':
        this.localSyncing = false
        this.emitStatus()
        break
      case 'remote-end':
        this.remoteSyncing = false
        this.emitStatus()
        break
      case 'sync-end':
        this.syncSyncing = false
        this.emitStatus()
        break
      case 'sync-target':
        if (args[0] !== -1) this.syncLastSeq = args[0]
        this.emitStatus()
        break
      case 'sync-current':
        this.syncCurrentSeq = args[0]
        this.emitStatus()
        break
      default:
        super.emit(name, ...args)
    }
  }
}
