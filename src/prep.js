/* @flow weak */

import Ignore from './ignore'
import logger from './logger'
import Merge from './merge'
import { buildId, ensureValidChecksum, ensureValidPath } from './metadata'

const log = logger({
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
  merge: Merge
  ignore: Ignore

  constructor (merge, ignore) {
    this.merge = merge
    this.ignore = ignore
  }

  /* Helpers */

  // Simple helper to add a file or a folder
  async addDocAsync (side, doc) {
    if (doc.docType === 'file') {
      return this.addFileAsync(side, doc)
    } else if (doc.docType === 'folder') {
      return this.putFolderAsync(side, doc)
    } else {
      throw new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  addDoc (side, doc, callback) {
    this.addDocAsync(side, doc).asCallback(callback)
  }

  // Simple helper to update a file or a folder
  async updateDocAsync (side, doc) {
    if (doc.docType === 'file') {
      return this.updateFileAsync(side, doc)
    } else if (doc.docType === 'folder') {
      return this.putFolderAsync(side, doc)
    } else {
      throw new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  updateDoc (side, doc, callback) {
    this.updateDocAsync(side, doc).asCallback(callback)
  }

  // Helper to move/rename a file or a folder
  async moveDocAsync (side, doc, was) {
    if (doc.docType !== was.docType) {
      throw new Error(`Incompatible docTypes: ${doc.docType}`)
    } else if (doc.docType === 'file') {
      return this.moveFileAsync(side, doc, was)
    } else if (doc.docType === 'folder') {
      return this.moveFolderAsync(side, doc, was)
    } else {
      throw new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  moveDoc (side, doc, was, callback) {
    this.moveDocAsync(side, doc, was).asCallback(callback)
  }

  // Simple helper to delete a file or a folder
  async deleteDocAsync (side, doc) {
    if (doc.docType === 'file') {
      return this.deleteFileAsync(side, doc)
    } else if (doc.docType === 'folder') {
      return this.deleteFolderAsync(side, doc)
    } else {
      throw new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  deleteDoc (side, doc, callback) {
    this.deleteDocAsync(side, doc).asCallback(callback)
  }

  /* Actions */

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  async addFileAsync (side, doc) {
    ensureValidPath(doc)
    ensureValidChecksum(doc)

    doc.docType = 'file'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }

    if (doc.creationDate == null) { doc.creationDate = new Date() }
    if (doc.lastModification == null) { doc.lastModification = new Date() }
    if (doc.lastModification === 'Invalid date') {
      doc.lastModification = new Date()
    }
    return this.merge.addFileAsync(side, doc)
  }

  addFile (side, doc, callback) {
    this.addFileAsync(side, doc).asCallback(callback)
  }

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  async updateFileAsync (side, doc) {
    ensureValidPath(doc)
    ensureValidChecksum(doc)

    doc.docType = 'file'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }

    if (doc.lastModification == null) { doc.lastModification = new Date() }
    if (doc.lastModification === 'Invalid date') {
      doc.lastModification = new Date()
    }
    return this.merge.updateFileAsync(side, doc)
  }

  updateFile (side, doc, callback) {
    this.updateFileAsync(side, doc).asCallback(callback)
  }

  // Expectations:
  //   - the folder path is present and valid
  async putFolderAsync (side, doc) {
    ensureValidPath(doc)

    doc.docType = 'folder'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    if (doc.lastModification == null) { doc.lastModification = new Date() }
    if (doc.lastModification === 'Invalid date') {
      doc.lastModification = new Date()
    }
    return this.merge.putFolderAsync(side, doc)
  }

  putFolder (side, doc, callback) {
    this.putFolderAsync(side, doc).asCallback(callback)
  }

  // Expectations:
  //   - the new file path is present and valid
  //   - the old file path is present and valid
  //   - the checksum is valid, if present
  //   - the two paths are not the same
  //   - the revision for the old file is present
  async moveFileAsync (side, doc, was) {
    ensureValidPath(doc)
    ensureValidPath(was)
    ensureValidChecksum(doc)

    if (doc.path === was.path) {
      log.warn(`Invalid move: ${JSON.stringify(was, null, 2)}`)
      log.warn(`to ${JSON.stringify(doc, null, 2)}`)
      throw new Error('Invalid move')
    } else if (!was._rev) {
      log.warn(`Missing rev: ${JSON.stringify(was, null, 2)}`)
      throw new Error('Missing rev')
    } else {
      return this.doMoveFile(side, doc, was)
    }
  }

  moveFile (side, doc, was, callback) {
    this.moveFileAsync(side, doc, was).asCallback(callback)
  }

  doMoveFile (side, doc, was) {
    doc.docType = 'file'
    if (doc.lastModification == null) { doc.lastModification = new Date() }
    if (doc.lastModification === 'Invalid date') {
      doc.lastModification = new Date()
    }
    buildId(doc)
    buildId(was)
    let docIgnored = this.ignore.isIgnored(doc)
    let wasIgnored = this.ignore.isIgnored(was)
    if ((side === 'local') && docIgnored && wasIgnored) { return }
    if ((side === 'local') && docIgnored) {
      return this.merge.deleteFileAsync(side, was)
    } else if ((side === 'local') && wasIgnored) {
      return this.merge.addFileAsync(side, doc)
    } else {
      return this.merge.moveFileAsync(side, doc, was)
    }
  }

  // Expectations:
  //   - the new folder path is present and valid
  //   - the old folder path is present and valid
  //   - the two paths are not the same
  //   - the revision for the old folder is present
  async moveFolderAsync (side, doc, was) {
    ensureValidPath(doc)
    ensureValidPath(was)
    if (doc.path === was.path) {
      log.warn(`Invalid move: ${JSON.stringify(doc, null, 2)}`)
      throw new Error('Invalid move')
    } else if (!was._rev) {
      log.warn(`Missing rev: ${JSON.stringify(was, null, 2)}`)
      throw new Error('Missing rev')
    } else {
      return this.doMoveFolder(side, doc, was)
    }
  }

  moveFolder (side, doc, was, callback) {
    this.moveFolderAsync(side, doc, was).asCallback(callback)
  }

  doMoveFolder (side, doc, was) {
    doc.docType = 'folder'
    if (doc.lastModification == null) { doc.lastModification = new Date() }
    if (doc.lastModification === 'Invalid date') {
      doc.lastModification = new Date()
    }
    buildId(doc)
    buildId(was)
    let docIgnored = this.ignore.isIgnored(doc)
    let wasIgnored = this.ignore.isIgnored(was)
    if ((side === 'local') && docIgnored && wasIgnored) { return }
    if ((side === 'local') && docIgnored) {
      return this.merge.deleteFolderAsync(side, was)
    } else if ((side === 'local') && wasIgnored) {
      return this.merge.putFolderAsync(side, doc)
    } else {
      return this.merge.moveFolderAsync(side, doc, was)
    }
  }

  // Expectations:
  //   - the file path is present and valid
  async deleteFileAsync (side, doc) {
    ensureValidPath(doc)

    doc.docType = 'file'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.deleteFileAsync(side, doc)
  }

  deleteFile (side, doc, callback) {
    this.deleteFileAsync(side, doc).asCallback(callback)
  }

  // Expectations:
  //   - the folder path is present and valid
  async deleteFolderAsync (side, doc) {
    ensureValidPath(doc)

    doc.docType = 'folder'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.deleteFolderAsync(side, doc)
  }

  deleteFolder (side, doc, callback) {
    this.deleteFolderAsync(side, doc).asCallback(callback)
  }
}

export default Prep
