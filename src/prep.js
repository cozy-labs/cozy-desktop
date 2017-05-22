/* @flow */

import clone from 'lodash.clone'
import { join } from 'path'

import Config from './config'
import Ignore from './ignore'
import logger from './logger'
import Merge from './merge'
import { buildId, ensureValidChecksum, ensureValidPath } from './metadata'
import { TRASH_DIR_NAME } from './remote/constants'

import type { SideName, Metadata } from './metadata'

const log = logger({
  component: 'Prep'
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
  config: Config

  constructor (merge: Merge, ignore: Ignore, config: Config) {
    this.merge = merge
    this.ignore = ignore
    this.config = config
  }

  /* Helpers */

  // Simple helper to add a file or a folder
  async addDocAsync (side: SideName, doc: Metadata) {
    if (doc.docType === 'file') {
      return this.addFileAsync(side, doc)
    } else if (doc.docType === 'folder') {
      return this.putFolderAsync(side, doc)
    } else {
      throw new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  // Simple helper to update a file or a folder
  async updateDocAsync (side: SideName, doc: Metadata) {
    if (doc.docType === 'file') {
      return this.updateFileAsync(side, doc)
    } else if (doc.docType === 'folder') {
      return this.putFolderAsync(side, doc)
    } else {
      throw new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  // Helper to move/rename a file or a folder
  async moveDocAsync (side: SideName, doc: Metadata, was: Metadata) {
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

  // Simple helper to restore a file or a folder
  async restoreDocAsync (side: SideName, was: Metadata, doc: Metadata) {
    if (doc.docType === 'file') {
      return this.restoreFileAsync(side, was, doc)
    } else if (doc.docType === 'folder') {
      return this.restoreFolderAsync(side, was, doc)
    } else {
      throw new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  // Simple helper to trash a file or a folder
  async trashDocAsync (side: SideName, was: Metadata, doc: ?Metadata) {
    if (was.docType === 'file') {
      return this.trashFileAsync(side, was, doc)
    } else if (was.docType === 'folder') {
      return this.trashFolderAsync(side, was, doc)
    } else {
      throw new Error(`Unexpected docType: ${was.docType}`)
    }
  }

  // Simple helper to delete a file or a folder
  async deleteDocAsync (side: SideName, doc: Metadata) {
    if (doc.docType === 'file') {
      return this.deleteFileAsync(side, doc)
    } else if (doc.docType === 'folder') {
      return this.deleteFolderAsync(side, doc)
    } else {
      throw new Error(`Unexpected docType: ${doc.docType}`)
    }
  }

  /* Actions */

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  async addFileAsync (side: SideName, doc: Metadata) {
    ensureValidPath(doc)
    ensureValidChecksum(doc)

    doc.docType = 'file'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.addFileAsync(side, doc)
  }

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  async updateFileAsync (side: SideName, doc: Metadata) {
    ensureValidPath(doc)
    ensureValidChecksum(doc)

    doc.docType = 'file'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.updateFileAsync(side, doc)
  }

  // Expectations:
  //   - the folder path is present and valid
  async putFolderAsync (side: SideName, doc: *) {
    ensureValidPath(doc)

    doc.docType = 'folder'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.putFolderAsync(side, doc)
  }

  // Expectations:
  //   - the new file path is present and valid
  //   - the old file path is present and valid
  //   - the checksum is valid, if present
  //   - the two paths are not the same
  //   - the revision for the old file is present
  async moveFileAsync (side: SideName, doc: Metadata, was: Metadata) {
    const {path} = doc
    ensureValidPath(doc)
    ensureValidPath(was)
    ensureValidChecksum(doc)

    if (doc.path === was.path) {
      const msg = 'Invalid move'
      log.warn({path}, msg)
      log.trace({path})
      throw new Error(msg)
    } else if (!was._rev) {
      const msg = 'Missing rev'
      log.warn({path}, msg)
      log.trace({path})
      throw new Error(msg)
    } else {
      return this.doMoveFile(side, doc, was)
    }
  }

  doMoveFile (side: SideName, doc: Metadata, was: Metadata) {
    doc.docType = 'file'
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
  async moveFolderAsync (side: SideName, doc: Metadata, was: Metadata) {
    const {path} = doc
    ensureValidPath(doc)
    ensureValidPath(was)
    if (doc.path === was.path) {
      const msg = 'Invalid move'
      log.warn({path}, msg)
      log.trace({path})
      throw new Error(msg)
    } else if (!was._rev) {
      const msg = 'Missing rev'
      log.warn({path}, msg)
      log.trace({path, was})
      throw new Error(msg)
    } else {
      return this.doMoveFolder(side, doc, was)
    }
  }

  doMoveFolder (side: SideName, doc: Metadata, was: Metadata) {
    doc.docType = 'folder'
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

  // TODO add comments + tests
  async restoreFileAsync (side: SideName, was: Metadata, doc: Metadata) {
    ensureValidPath(doc)
    ensureValidPath(was)
    ensureValidChecksum(doc)

    delete doc.trashed
    doc.docType = 'file'
    buildId(doc)
    buildId(was)
    // TODO ignore.isIgnored
    return this.merge.restoreFileAsync(side, was, doc)
  }

  // TODO add comments + tests
  async restoreFolderAsync (side: SideName, was: Metadata, doc: Metadata) {
    ensureValidPath(doc)
    ensureValidPath(was)

    delete doc.trashed
    doc.docType = 'folder'
    buildId(doc)
    buildId(was)
    // TODO ignore.isIgnored
    return this.merge.restoreFolderAsync(side, was, doc)
  }

  // TODO add comments + tests
  async trashFileAsync (side: SideName, was: *, doc: *) {
    ensureValidPath(was)

    if (!doc) {
      doc = clone(was)
      doc.path = join(TRASH_DIR_NAME, was.path)
    }

    ensureValidPath(doc)
    ensureValidChecksum(doc)

    doc.trashed = true
    doc.docType = 'file'
    buildId(doc)
    buildId(was)
    // TODO ignore.isIgnored
    return this.merge.trashFileAsync(side, was, doc)
  }

  // TODO add comments + tests
  async trashFolderAsync (side: SideName, was: *, doc: *) {
    ensureValidPath(was)

    if (!doc) {
      doc = clone(was)
      doc.path = join(TRASH_DIR_NAME, was.path)
    }

    ensureValidPath(doc)

    doc.trashed = true
    doc.docType = 'folder'
    buildId(doc)
    buildId(was)
    // TODO ignore.isIgnored
    return this.merge.trashFolderAsync(side, was, doc)
  }

  // Expectations:
  //   - the file path is present and valid
  async deleteFileAsync (side: SideName, doc: Metadata) {
    ensureValidPath(doc)

    doc.docType = 'file'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.deleteFileAsync(side, doc)
  }

  // Expectations:
  //   - the folder path is present and valid
  async deleteFolderAsync (side: SideName, doc: Metadata) {
    ensureValidPath(doc)

    doc.docType = 'folder'
    buildId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.deleteFolderAsync(side, doc)
  }
}

export default Prep
