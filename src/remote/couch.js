import PouchDB from 'pouchdb'
import isEqual from 'lodash.isequal'
import pick from 'lodash.pick'
import request from 'request-json-light'
import uuid from 'node-uuid'
let log = require('printit')({
  prefix: 'Remote CouchDB',
  date: true
})

// Couch is an helper class for communication with a remote couchdb.
// It uses the pouchdb library for usual stuff, as it helps to deal with errors.
// But for attachments, pouchdb uses buffers, which is not ideal in node.js
// because it can takes a lot of memory. So, we prefered to use
// request-json-light, that can stream data.
class Couch {

  // Create a new unique identifier for CouchDB
  static newId () {
    return uuid.v4().replace(/-/g, '')
  }

  constructor (config, events) {
    this.config = config
    this.events = events
    let device = this.config.getDevice()
    let options = this.config.augmentCouchOptions({
      auth: {
        username: device.deviceName,
        password: device.password
      }
    })
    this.client = new PouchDB(`${device.url}/cozy`, options)
    this.http = request.newClient(device.url)
    this.http.setBasicAuth(device.deviceName, device.password)
    this.online = true
    this.upCallbacks = []
  }

  // Try to ping CouchDb to check that we can communicate with it
  // (the desktop has network access and the cozy stack is up).
  ping (callback) {
    this.client.get('', (err, res) => {
      let online = !err && (res.db_name != null)
      if (online && !this.online) {
        this.goingOnline()
      } else if (!online && this.online) {
        this.goingOffline()
      }
      callback(this.online)
    })
  }

  // Couch is available again!
  goingOnline () {
    log.info('The network is available again')
    this.online = true
    for (let cb of Array.from(this.upCallbacks)) { cb() }
    this.upCallbacks = []
    this.events.emit('online')
  }

  // Couch is no longer available.
  // Check every minute if the network is back.
  goingOffline () {
    let interval
    log.info("The Cozy can't be reached currently")
    this.online = false
    this.events.emit('offline')
    interval = setInterval(() => {
      this.ping(function (available) {
        if (available) { clearInterval(interval) }
      })
    }, 60000)
  }

  // The callback will be called when couch will be available again.
  whenAvailable (callback) {
    if (this.online) {
      callback()
    } else {
      this.upCallbacks.push(callback)
    }
  }

  // Retrieve a document from remote cozy based on its ID
  get (id, callback) {
    this.client.get(id, callback)
  }

  // Save a document on the remote couch
  put (doc, callback) {
    this.client.put(doc, callback)
  }

  // Delete a document on the remote couch
  remove (id, rev, callback) {
    this.client.remove(id, rev, callback)
  }

  // Get the last sequence number from the remote couch
  getLastRemoteChangeSeq (callback) {
    log.info('Getting last remote change sequence number:')
    let options = {
      descending: true,
      limit: 1
    }
    this.client.changes(options, (err, change) => callback(err, __guard__(change, x => x.last_seq)))
  }

  // TODO create our views on couch, instead of using those of files
  pickViewToCopy (model, callback) {
    log.info(`Getting design doc ${model} from remote`)
    this.client.get(`_design/${model}`, function (err, designdoc) {
      if (err) {
        callback(err)
      } else if (__guard__(designdoc.views, x => x['files-all'])) {
        callback(null, 'files-all')
      } else if (__guard__(designdoc.views, x1 => x1.all)) {
        callback(null, 'all')
      } else {
        callback(new Error('install files app on cozy'))
      }
    })
  }

  // Retrieve documents from a view on the remote couch
  getFromRemoteView (model, callback) {
    this.pickViewToCopy(model, (err, viewName) => {
      if (err) { callback(err) }
      log.info(`Getting latest ${model} documents from remote`)
      let opts = {include_docs: true}
      this.client.query(`${model}/${viewName}`, opts, (err, body) => callback(err, __guard__(body, x => x.rows)))
    })
  }

  // Upload given file as attachment of given document (id + revision)
  uploadAsAttachment (id, rev, mime, attachment, callback) {
    let urlPath = `cozy/${id}/file?rev=${rev}`
    this.http.headers['content-type'] = mime
    this.http.putFile(urlPath, attachment, function (err, res, body) {
      if (err) {
        callback(err)
      } else if (body.error) {
        callback(body.error)
      } else {
        log.info('Binary uploaded')
        callback(null, body)
      }
    })
  }

  // Give a readable stream of a file stored on the remote couch
  downloadBinary (binaryId, callback) {
    let urlPath = `cozy/${binaryId}/file`
    log.info(`Download ${urlPath}`)
    this.http.saveFileAsStream(urlPath, function (err, res) {
      if (__guard__(res, x => x.statusCode) === 404) {
        err = new Error('Cannot download the file')
        res.on('data', function () {})  // Purge the stream
      }
      callback(err, res)
    })
  }

  // Compare two remote docs and say if they are the same,
  // i.e. can we replace one by the other with no impact
  sameRemoteDoc (one, two) {
    let fields = ['path', 'name', 'creationDate', 'checksum', 'size']
    one = pick(one, fields)
    two = pick(two, fields)
    return isEqual(one, two)
  }

  // Put the document on the remote cozy
  // In case of a conflict in CouchDB, try to see if the changes on the remote
  // sides are trivial and can be ignored.
  putRemoteDoc (doc, old, callback) {
    this.put(doc, (err, created) => {
      if (__guard__(err, x => x.status) === 409) {
        this.get(doc._id, (err, current) => {
          if (err) {
            callback(err)
          } else if (this.sameRemoteDoc(current, old)) {
            doc._rev = current._rev
            this.put(doc, callback)
          } else {
            callback(new Error('Conflict'))
          }
        })
      } else {
        callback(err, created)
      }
    })
  }

  // Remove a remote document
  // In case of a conflict in CouchDB, try to see if the changes on the remote
  // sides are trivial and can be ignored.
  removeRemoteDoc (doc, callback) {
    doc._deleted = true
    this.put(doc, (err, removed) => {
      if (__guard__(err, x => x.status) === 409) {
        this.get(doc._id, (err, current) => {
          if (err) {
            callback(err)
          } else if (this.sameRemoteDoc(current, doc)) {
            current._deleted = true
            this.put(current, callback)
          } else {
            callback(new Error('Conflict'))
          }
        })
      } else {
        callback(err, removed)
      }
    })
  }
}

export default Couch

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
