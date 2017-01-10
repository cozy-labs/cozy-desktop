import async from 'async'
import clone from 'lodash.clone'
import path from 'path'
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
        }
                )
      }
    }
        )
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
      }
            , function (err) {
              log.info(`${rows.length} docs retrieved for ${model}.`)
              return callback(err)
            })
    }
        )
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
        }
                )
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
                    }
                )
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
                      }
                        )
                    }
                )
                    .on('complete', () => {
                      this.changes = null
                      return this.whenReady(callback)
                    }
                )
      }
    }
        )
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
    log.info('OnChange', doc)
    return this.pouch.byRemoteId(doc._id, (err, was) => {
      if (err && (err.status !== 404)) {
        return callback(err)
      } else if (doc._deleted) {
        if (err || (was == null)) {
                    // It's fine if the file was deleted on local and on remote
          return callback()
        } else {
          return this.prep.deleteDoc(this.side, was, callback)
        }
      } else if (['folder', 'Folder'].includes(doc.docType) || __guard__(doc.binary, x => x.file)) {
        return this.putDoc(doc, was, callback)
      } else {
        return callback()
      }
    }
        )
  }

    // Transform a remote document in a local one
    //
    // We are tolerant with the input. For example, we don't expect the docType
    // to be in lower case, and we accept files with no checksum (e.g. from
    // konnectors).
  createLocalDoc (remote) {
    let docPath = remote.path || ''
    let docName = remote.name || ''
    let doc = {
      path: path.join(docPath, docName),
      docType: remote.docType.toLowerCase(),
      creationDate: remote.creationDate,
      lastModification: remote.lastModification,
      executable: remote.executable,
      remote: {
        _id: remote._id,
        _rev: remote._rev
      }
    }
    if (doc.docType === 'file') {
      doc.remote.binary = {
        _id: remote.binary.file.id,
        _rev: remote.binary.file.rev
      }
    }
    for (let field of ['checksum', 'size', 'class', 'mime', 'tags', 'localPath']) {
      if (remote[field]) { doc[field] = remote[field] }
    }
    return doc
  }

    // Transform the doc and save it in pouchdb
    //
    // In CouchDB, the filepath is in the path and name fields.
    // In PouchDB, the filepath is in the path only.
    // And the _id/_rev from CouchDB are saved in the remote field in PouchDB.
  putDoc (remote, was, callback) {
    let doc = this.createLocalDoc(remote)
    if (this.prep.invalidPath(doc)) {
      log.error('Invalid id')
      log.error(doc)
      return callback(new Error('Invalid path/name'))
    } else if (!was) {
      return this.prep.addDoc(this.side, doc, callback)
    } else if (was.path === doc.path) {
      return this.prep.updateDoc(this.side, doc, callback)
    } else if ((doc.checksum != null) && (was.checksum === doc.checksum)) {
      return this.prep.moveDoc(this.side, doc, was, callback)
    } else if ((doc.docType === 'folder') || (was.remote._rev === doc._rev)) {
            // Example: doc is modified + renamed on cozy with desktop stopped
      return this.prep.deleteDoc(this.side, was, err => {
        if (err) { log.error(err) }
        return this.prep.addDoc(this.side, doc, callback)
      }
            )
    } else {
            // Example: doc is renamed on cozy while modified on desktop
      return this.removeRemote(was, err => {
        if (err) { log.error(err) }
        return this.prep.addDoc(this.side, doc, callback)
      }
            )
    }
  }

    // Remove the association between a document and its remote
    // It's useful when a file has diverged (updated/renamed both in local and
    // remote) while cozy-desktop was not running.
  removeRemote (doc, callback) {
    delete doc.remote
    delete doc.sides.remote
    return this.pouch.db.put(doc, callback)
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
