import path from 'path'
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
    this.addDoc = this.addDoc.bind(this)
    this.updateDoc = this.updateDoc.bind(this)
    this.moveDoc = this.moveDoc.bind(this)
    this.deleteDoc = this.deleteDoc.bind(this)
    this.merge = merge
    this.ignore = ignore
    switch (process.platform) {
      case 'linux': case 'freebsd': case 'sunos':
        this.buildId = this.buildIdUnix
        break
      case 'darwin':
        this.buildId = this.buildIdHFS
        break
      default:
        log.error(`Sorry, ${process.platform} is not supported!`)
        process.exit(1)
    }
  }

    /* Helpers */

    // Build an _id from the path for a case sensitive file system (Linux, BSD)
  buildIdUnix (doc) {
    doc._id = doc.path
  }

    // Build an _id from the path for OSX (HFS+ file system):
    // - case preservative, but not case sensitive
    // - unicode NFD normalization (sort of)
    //
    // See https://nodejs.org/en/docs/guides/working-with-different-filesystems/
    // for why toUpperCase is better than toLowerCase
    //
    // Note: String.prototype.normalize is not available on node 0.10 and does
    // nothing when node is compiled without intl option.
  buildIdHFS (doc) {
    let id = doc.path
    if (id.normalize) { id = id.normalize('NFD') }
    doc._id = id.toUpperCase()
  }

    // Return true if the document has not a valid path
    // (ie a path inside the mount point)
  invalidPath (doc) {
    if (!doc.path) { return true }
    doc.path = path.normalize(doc.path)
    doc.path = doc.path.replace(/^\//, '')
    let parts = doc.path.split(path.sep)
    return (doc.path === '.') ||
            (doc.path === '') ||
            (parts.indexOf('..') >= 0)
  }

    // Return true if the checksum is invalid
    // If the checksum is missing, it is not invalid, just missing,
    // so it returns false.
    // SHA-1 has 40 hexadecimal letters
  invalidChecksum (doc) {
    if (doc.checksum != null) {
      doc.checksum = doc.checksum.toLowerCase()
      return !doc.checksum.match(/^[a-f0-9]{40}$/)
    } else {
      return false
    }
  }

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
    if (this.invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (this.invalidChecksum(doc)) {
      log.warn(`Invalid checksum: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid checksum'))
    } else {
      doc.docType = 'file'
      this.buildId(doc)
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
    if (this.invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (this.invalidChecksum(doc)) {
      log.warn(`Invalid checksum: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid checksum'))
    } else {
      doc.docType = 'file'
      this.buildId(doc)
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
    if (this.invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else {
      doc.docType = 'folder'
      this.buildId(doc)
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
    if (this.invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (this.invalidPath(was)) {
      log.warn(`Invalid path: ${JSON.stringify(was, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (this.invalidChecksum(doc)) {
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
    this.buildId(doc)
    this.buildId(was)
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
    if (this.invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else if (this.invalidPath(was)) {
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
    this.buildId(doc)
    this.buildId(was)
    let docIgnored = this.ignore.isIgnored(doc)
    let wasIgnored = this.ignore.isIgnored(was)
    if ((side === 'local') && docIgnored && wasIgnored) {
      return callback()
    } else if ((side === 'local') && docIgnored) {
      return this.merge.deleteFolder(side, was, callback)
    } else if ((side === 'local') && wasIgnored) {
      return this.merge.addFolder(side, doc, callback)
    } else {
      return this.merge.moveFolder(side, doc, was, callback)
    }
  }

    // Expectations:
    //   - the file path is present and valid
  deleteFile (side, doc, callback) {
    if (this.invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else {
      doc.docType = 'file'
      this.buildId(doc)
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
    if (this.invalidPath(doc)) {
      log.warn(`Invalid path: ${JSON.stringify(doc, null, 2)}`)
      return callback(new Error('Invalid path'))
    } else {
      doc.docType = 'folder'
      this.buildId(doc)
      if ((side === 'local') && this.ignore.isIgnored(doc)) {
        return callback()
      } else {
        return this.merge.deleteFolder(side, doc, callback)
      }
    }
  }
}

export default Prep
