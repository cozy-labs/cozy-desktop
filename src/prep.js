import Promise from 'bluebird'
import { buildId, invalidChecksum, invalidPath } from './metadata'
let log = require('printit')({
  prefix: 'Prep          ',
  date: true
})

// When the local filesystem or the remote cozy detects a change, it calls this
// class to inform it. This class will check this event, add some informations,
// and give it to merge, so it can be saved in pouchdb.
//
// The documents in PouchDB have similar informations of those in CouchDB, but
// are not structured in the same way. In particular, the _id are uuid in CouchDB
// and the path to the file/folder (in a normalized form) in PouchDB.
class Prep {
  constructor (merge, ignore) {
    this.merge = merge
    this.ignore = ignore

    Promise.promisifyAll(this)
  }

  /* Helpers */

  // Simple helper to add a file or a folder
  addDoc (side, doc, callback) {
    if (doc.docType === 'file') {
      return this.addFile(side, doc, callback)
    } else if (doc.docType === 'folder') {
      return this.putFolder(side, doc, callback)
    } else {
      return callback(new Error(`Unexpected docType: ${doc.docType}`))
    }
  }

  // Simple helper to update a file or a folder
  updateDoc (side, doc, callback) {
    if (doc.docType === 'file') {
      return this.updateFile(side, doc, callback)
    } else if (doc.docType === 'folder') {
      return this.putFolder(side, doc, callback)
    } else {
      return callback(new Error(`Unexpected docType: ${doc.docType}`))
    }
  }

  // Helper to move/rename a file or a folder
  moveDoc (side, doc, was, callback) {
    if (doc.docType !== was.docType) {
      return callback(new Error(`Incompatible docTypes: ${doc.docType}`))
    } else if (doc.docType === 'file') {
      return this.moveFile(side, doc, was, callback)
    } else if (doc.docType === 'folder') {
      return this.moveFolder(side, doc, was, callback)
    } else {
      return callback(new Error(`Unexpected docType: ${doc.docType}`))
    }
  }

  // Simple helper to delete a file or a folder
  deleteDoc (side, doc, callback) {
    if (doc.docType === 'file') {
      return this.deleteFile(side, doc, callback)
    } else if (doc.docType === 'folder') {
      return this.deleteFolder(side, doc, callback)
    } else {
      return callback(new Error(`Unexpected docType: ${doc.docType}`))
    }
  }

  /* Actions */

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  addFile (side, doc, callback) {
    if (invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (invalidChecksum(doc)) {
      log.warn(`Invalid checksum: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid checksum'))
    } else {
      doc.docType = 'file'
      buildId(doc)
      if ((side === 'local') && this.ignore.isIgnored(doc)) {
        return callback()
      } else {
        if (doc.creationDate == null) { doc.creationDate = new Date() }
        if (doc.lastModification == null) { doc.lastModification = new Date() }
        if (doc.lastModification === 'Invalid date') {
          doc.lastModification = new Date()
        }
        return this.merge.addFile(side, doc, callback)
      }
    }
  }

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  updateFile (side, doc, callback) {
    if (invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (invalidChecksum(doc)) {
      log.warn(`Invalid checksum: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid checksum'))
    } else {
      doc.docType = 'file'
      buildId(doc)
      if ((side === 'local') && this.ignore.isIgnored(doc)) {
        return callback()
      } else {
        if (doc.lastModification == null) { doc.lastModification = new Date() }
        if (doc.lastModification === 'Invalid date') {
          doc.lastModification = new Date()
        }
        return this.merge.updateFile(side, doc, callback)
      }
    }
  }

  // Expectations:
  //   - the folder path is present and valid
  putFolder (side, doc, callback) {
    if (invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else {
      doc.docType = 'folder'
      buildId(doc)
      if ((side === 'local') && this.ignore.isIgnored(doc)) {
        return callback()
      } else {
        if (doc.lastModification == null) { doc.lastModification = new Date() }
        if (doc.lastModification === 'Invalid date') {
          doc.lastModification = new Date()
        }
        return this.merge.putFolder(side, doc, callback)
      }
    }
  }

  // Expectations:
  //   - the new file path is present and valid
  //   - the old file path is present and valid
  //   - the checksum is valid, if present
  //   - the two paths are not the same
  //   - the revision for the old file is present
  moveFile (side, doc, was, callback) {
    if (invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (invalidPath(was)) {
      log.warn(`Invalid path: ${JSON.stringify(was, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (invalidChecksum(doc)) {
      log.warn(`Invalid checksum: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid checksum'))
    } else if (doc.path === was.path) {
      log.warn(`Invalid move: ${JSON.stringify(was, null, 2)}`)
      log.warn(`to ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid move'))
    } else if (!was._rev) {
      log.warn(`Missing rev: ${JSON.stringify(was, null, 2)}`)
      return callback(new Error('Missing rev'))
    } else {
      return this.doMoveFile(side, doc, was, callback)
    }
  }

  doMoveFile (side, doc, was, callback) {
    doc.docType = 'file'
    if (doc.lastModification == null) { doc.lastModification = new Date() }
    if (doc.lastModification === 'Invalid date') {
      doc.lastModification = new Date()
    }
    buildId(doc)
    buildId(was)
    let docIgnored = this.ignore.isIgnored(doc)
    let wasIgnored = this.ignore.isIgnored(was)
    if ((side === 'local') && docIgnored && wasIgnored) {
      return callback()
    } else if ((side === 'local') && docIgnored) {
      return this.merge.deleteFile(side, was, callback)
    } else if ((side === 'local') && wasIgnored) {
      return this.merge.addFile(side, doc, callback)
    } else {
      return this.merge.moveFile(side, doc, was, callback)
    }
  }

  // Expectations:
  //   - the new folder path is present and valid
  //   - the old folder path is present and valid
  //   - the two paths are not the same
  //   - the revision for the old folder is present
  moveFolder (side, doc, was, callback) {
    if (invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (invalidPath(was)) {
      log.warn(`Invalid path: ${JSON.stringify(was, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (doc.path === was.path) {
      log.warn(`Invalid move: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid move'))
    } else if (!was._rev) {
      log.warn(`Missing rev: ${JSON.stringify(was, null, 2)}`)
      return callback(new Error('Missing rev'))
    } else {
      return this.doMoveFolder(side, doc, was, callback)
    }
  }

  doMoveFolder (side, doc, was, callback) {
    doc.docType = 'folder'
    if (doc.lastModification == null) { doc.lastModification = new Date() }
    if (doc.lastModification === 'Invalid date') {
      doc.lastModification = new Date()
    }
    buildId(doc)
    buildId(was)
    let docIgnored = this.ignore.isIgnored(doc)
    let wasIgnored = this.ignore.isIgnored(was)
    if ((side === 'local') && docIgnored && wasIgnored) {
      return callback()
    } else if ((side === 'local') && docIgnored) {
      return this.merge.deleteFolder(side, was, callback)
    } else if ((side === 'local') && wasIgnored) {
      return this.merge.putFolder(side, doc, callback)
    } else {
      return this.merge.moveFolder(side, doc, was, callback)
    }
  }

  // Expectations:
  //   - the file path is present and valid
  deleteFile (side, doc, callback) {
    if (invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else {
      doc.docType = 'file'
      buildId(doc)
      if ((side === 'local') && this.ignore.isIgnored(doc)) {
        return callback()
      } else {
        return this.merge.deleteFile(side, doc, callback)
      }
    }
  }

  // Expectations:
  //   - the folder path is present and valid
  deleteFolder (side, doc, callback) {
    if (invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else {
      doc.docType = 'folder'
      buildId(doc)
      if ((side === 'local') && this.ignore.isIgnored(doc)) {
        return callback()
      } else {
        return this.merge.deleteFolder(side, doc, callback)
      }
    }
  }
}

export default Prep
