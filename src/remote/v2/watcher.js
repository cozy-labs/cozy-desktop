import async from 'async'
import { filteredReplication as filterSDK } from 'cozy-device-sdk'
let log = require('printit')({
  prefix: 'Remote watcher',
  date: true
})

// Watch for changes from the remote couchdb and give them to the merge
//
// TODO add comments
// TODO refactor unit tests
class RemoteWatcher {
  constructor (couch, prep, pouch, deviceName) {
    this.couch = couch
    this.prep = prep
    this.pouch = pouch
    this.deviceName = deviceName
    this.side = 'remote'
    this.errors = 0
    this.pending = 0
  }

  // Stop listening to couchdb
  stopListening () {
    __guard__(this.changes, x => x.cancel())
    this.changes = null
  }

  // First time replication (when the databases is blank)
  //
  // Filtered replication or changes feed is slow with a lot of documents and
  // revisions. We prefer to copy manually these documents for the initial
  // replication.
  //
  // TODO use a single view
  // TODO add integration tests
  initialReplication (callback) {
    return this.couch.getLastRemoteChangeSeq((err, seq) => {
      if (err) {
        log.error('An error occured contacting your remote Cozy')
        log.error(err)
        return callback(err)
      } else {
        return async.series([
          next => this.copyDocsFromRemoteView('folder', next),
          next => this.copyDocsFromRemoteView('file', next)
        ], err => {
          if (err) {
            log.error('An error occured copying database')
            log.error(err)
            return callback(err)
          } else {
            log.info('All your files are available on your device.')
            return this.pouch.setRemoteSeq(seq, callback)
          }
        })
      }
    })
  }

  // Manual replication for a doctype:
  // copy the documents from a remote view to the local pouchdb
  copyDocsFromRemoteView (model, callback) {
    return this.couch.getFromRemoteView(model, (err, rows) => {
      if (err) { return callback(err) }
      if (!__guard__(rows, x => x.length)) { return callback(null) }
      return async.eachSeries(rows, (row, cb) => {
        return this.onChange(row.value, function (err) {
          if (err) {
            log.error('Failed to copy one doc')
            log.error(err)
          }
          return cb()
        })
      }, function (err) {
        log.info(`${rows.length} docs retrieved for ${model}.`)
        return callback(err)
      })
    })
  }

  // Listen to the Couchdb changes feed for files and folders updates
  // TODO use a view instead of a filter
  listenToChanges (options, callback) {
    return this.pouch.getRemoteSeq((err, seq) => {
      if (err) {
        return callback(err)
      } else if (seq === 0) {
        return this.initialReplication(err => {
          if (err) {
            return callback(err)
          } else {
            return this.whenReady(callback)
          }
        })
      } else {
        this.changes = this.couch.client.changes({
          filter: filterSDK.getFilterName(this.deviceName),
          live: options.live,
          retry: true,
          since: seq,
          include_docs: true,
          heartbeat: 9500
        })
        return this.changes
          .on('change', change => {
            this.errors = 0
            return this.onChange(change.doc, this.changed(change))
          })
          .on('error', err => {
            let cb;
            [cb, callback] = [callback, function () {}]
            this.changes = null
            if (__guard__(err, x => x.status) === 401) {
              let msg = 'The device is no longer registered'
              return cb(new Error(msg))
            }
            let retry = () => {
              return this.listenToChanges(options, cb)
            }
            return this.couch.ping(available => {
              if (available) {
                return this.backoff(err, cb, retry)
              } else {
                return this.couch.whenAvailable(retry)
              }
            })
          })
          .on('complete', () => {
            this.changes = null
            return this.whenReady(callback)
          })
      }
    })
  }

  // Wait for all the changes from CouchDB has been saved in Pouch
  // to call the callback
  // TODO tests
  whenReady (callback) {
    if (this.pending === 0) {
      return callback()
    } else {
      return setTimeout(() => this.whenReady(callback), 100)
    }
  }

  // When the replication fails, wait before trying again.
  // For the first error, we wait between 2s and 4s.
  // For next errors, it's 4 times longer.
  // After 5 errors, we give up.
  // TODO tests
  backoff (err, fail, retry) {
    this.errors++
    log.warn('An error occured during replication.')
    log.error(err)
    if (this.errors >= 5) {
      this.errors = 0
      return fail(err)
    } else {
      let wait = (1 + Math.random()) * 500
      wait = ~~wait << (this.errors * 2)   // ~~ is to coerce to an int
      return setTimeout(retry, wait)
    }
  }

  // Take one change from the changes feed and give it to merge
  onChange (doc, callback) {
    return this.pouch.byRemoteId(doc._id, (err, was) => {
      if (err && (err.status !== 404)) {
        return callback(err)
      }
    })
  }

  // Keep track of the sequence number and log errors
  // TODO test pending counts
  changed (change) {
    this.pending++
    return err => {
      this.pending--
      if (err) {
        return log.error(err, change)
      } else {
        return this.pouch.setRemoteSeq(change.seq, function (err) {
          if (err) {
            log.warn('Cannot save the remote sequence number')
            return log.error(err)
          }
        })
      }
    }
  }
}

export default RemoteWatcher

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
