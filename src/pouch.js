import PouchDB from 'pouchdb'
import async from 'async'
import fs from 'fs-extra'
import isEqual from 'lodash.isequal'
import path from 'path'
let log = require('printit')({
  prefix: 'Local Pouchdb ',
  date: true
})

// Pouchdb is used to store all the metadata about files and folders.
// These metadata can come from the local filesystem or the remote cozy instance.
//
// Best practices from:
// http://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html
// http://docs.ehealthafrica.org/couchdb-best-practices/
//
// For naming conventions, we kept those used on cozy and its couchdb. So, it's
// creationDate and lastModification instead of created_at and updated_at. And
// views name are in camelcase (byChecksum, not by-checksum).
class Pouch {
  constructor (config) {
    this.config = config
    this.db = new PouchDB(this.config.dbPath)
    this.db.setMaxListeners(100)
    this.db.on('error', err => log.warn(err))
    this.updater = async.queue((task, callback) => {
      return this.db.get(task._id, (err, doc) => {
        if (__guard__(err, x => x.status) === 404) {
          return this.db.put(task, callback)
        } else if (err) {
          return callback(err)
        } else {
          task._rev = doc._rev
          return this.db.put(task, callback)
        }
      }
            )
    }
        )
  }

    // Create database and recreate all filters
  resetDatabase (callback) {
    this.db.destroy(() => {
      fs.ensureDirSync(this.config.dbPath)
      this.db = new PouchDB(this.config.dbPath)
      this.db.setMaxListeners(100)
      this.db.on('error', err => log.warn(err))
      return this.addAllViews(callback)
    }
        )
  }

    /* Mini ODM */

    // Run a query and get all the results
  getAll (query, params, callback) {
    if (typeof params === 'function') {
      callback = params
      params = {include_docs: true}
    }
        // XXX Pouchdb does sometimes send us undefined values in docs.
        // It's rare and we didn't find a way to extract a proper test case.
        // So, we keep a workaround and hope that this bug will be fixed.
    this.db.query(query, params, function (err, res) {
      if (err) {
        return callback(err)
      } else {
        let docs = (Array.from(res.rows).filter((row) => (row.doc != null)).map((row) => row.doc))
        return callback(null, docs)
      }
    })
  }

    // Return all the files with this checksum
  byChecksum (checksum, callback) {
    let params = {
      key: checksum,
      include_docs: true
    }
    return this.getAll('byChecksum', params, callback)
  }

    // Return all the files and folders in this path, only at first level
  byPath (path, callback) {
    let params = {
      key: path,
      include_docs: true
    }
    return this.getAll('byPath', params, callback)
  }

    // Return all the files and folders in this path, even in subfolders
  byRecursivePath (path, callback) {
    let params
    if (path === '') {
      params =
                {include_docs: true}
    } else {
      params = {
        startkey: `${path}`,
        endkey: `${path}/\ufff0`,
        include_docs: true
      }
    }
    return this.getAll('byPath', params, callback)
  }

    // Return the file/folder with this remote id
  byRemoteId (id, callback) {
    let params = {
      key: id,
      include_docs: true
    }
    this.db.query('byRemoteId', params, function (err, res) {
      if (err) {
        return callback(err)
      } else if (res.rows.length === 0) {
        return callback({status: 404, message: 'missing'})
      } else {
        return callback(null, res.rows[0].doc)
      }
    })
  }

    /* Views */

    // Create all required views in the database
  addAllViews (callback) {
    return async.series([
      this.addByPathView,
      this.addByChecksumView,
      this.addByRemoteIdView
    ], err => callback(err))
  }

    // Create a view to list files and folders inside a path
    // The path for a file/folder in root will be '',
    // not '.' as with node's path.dirname
  addByPathView (callback) {
        /* !pragma no-coverage-next */
    let query =
            function (doc) {
              if ('docType' in doc) {
                let parts = doc._id.split('/')
                parts.pop()
                return emit(parts.join('/'), {_id: doc._id})
              }
            }.toString()
    return this.createDesignDoc('byPath', query, callback)
  }

    // Create a view to find files by their checksum
  addByChecksumView (callback) {
        /* !pragma no-coverage-next */
    let query =
            function (doc) {
              if ('checksum' in doc) {
                return emit(doc.checksum)
              }
            }.toString()
    return this.createDesignDoc('byChecksum', query, callback)
  }

    // Create a view to find file/folder by their _id on a remote cozy
  addByRemoteIdView (callback) {
        /* !pragma no-coverage-next */
    let query =
            function (doc) {
              if ('remote' in doc) {
                return emit(doc.remote._id)
              }
            }.toString()
    return this.createDesignDoc('byRemoteId', query, callback)
  }

    // Create or update given design doc
  createDesignDoc (name, query, callback) {
    let doc = {
      _id: `_design/${name}`,
      views: {}
    }
    doc.views[name] = {map: query}
    this.db.get(doc._id, (_, designDoc) => {
      if (designDoc != null) {
        doc._rev = designDoc._rev
        if (isEqual(doc, designDoc)) { return callback() }
      }
      return this.db.put(doc, function (err) {
        if (!err) { log.info(`Design document created: ${name}`) }
        return callback(err)
      })
    }
        )
  }

    // Remove a design document for a given docType
  removeDesignDoc (docType, callback) {
    let id = `_design/${docType}`
    this.db.get(id, (err, designDoc) => {
      if (designDoc != null) {
        return this.db.remove(id, designDoc._rev, callback)
      } else {
        return callback(err)
      }
    }
        )
  }

    /* Helpers */

    // Extract the revision number, or 0 it not found
  extractRevNumber (infos) {
    try {
      let rev = infos._rev.split('-')[0]
      return Number(rev)
    } catch (error) {
      return 0
    }
  }

    // Retrieve a previous doc revision from its id
  getPreviousRev (id, shortRev, callback) {
    let options = {
      revs: true,
      revs_info: true,
      open_revs: 'all'
    }
    this.db.get(id, options, (err, infos) => {
      if (err) {
        return callback(err)
      } else {
        let { ids } = infos[0].ok._revisions
        let { start } = infos[0].ok._revisions
        let revId = ids[start - shortRev]
        let rev = `${shortRev}-${revId}`
        return this.db.get(id, {rev}, function (err, doc) {
          if (err) { log.debug(infos[0].doc) }
          return callback(err, doc)
        })
      }
    }
        )
  }

    /* Sequence numbers */

    // Get last local replication sequence,
    // ie the last change from pouchdb that have been applied
  getLocalSeq (callback) {
    this.db.get('_local/localSeq', function (err, doc) {
      if (__guard__(err, x => x.status) === 404) {
        return callback(null, 0)
      } else {
        return callback(err, __guard__(doc, x1 => x1.seq))
      }
    })
  }

    // Set last local replication sequence
    // It is saved in PouchDB as a local document
    // See http://pouchdb.com/guides/local-documents.html
  setLocalSeq (seq, callback) {
    let task = {
      _id: '_local/localSeq',
      seq
    }
    return this.updater.push(task, callback)
  }

    // Get last remote replication sequence,
    // ie the last change from couchdb that have been saved in pouch
  getRemoteSeq (callback) {
    this.db.get('_local/remoteSeq', function (err, doc) {
      if (__guard__(err, x => x.status) === 404) {
        return callback(null, 0)
      } else {
        return callback(err, __guard__(doc, x1 => x1.seq))
      }
    })
  }

    // Set last remote replication sequence
    // It is saved in PouchDB as a local document
    // See http://pouchdb.com/guides/local-documents.html
  setRemoteSeq (seq, callback) {
    let task = {
      _id: '_local/remoteSeq',
      seq
    }
    return this.updater.push(task, callback)
  }
}

export default Pouch

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
