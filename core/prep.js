/* @flow */

const autoBind = require('auto-bind')
const { clone } = require('lodash')
const { join } = require('path')

const logger = require('./logger')
const { assignId, ensureValidChecksum, ensureValidPath } = require('./metadata')
const { TRASH_DIR_NAME } = require('./remote/constants')

/*::
import type Config from './config'
import type Ignore from './ignore'
import type Merge from './merge'
import type { SideName, Metadata } from './metadata'
import type { PathObject } from './utils/path'
*/

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
  /*::
  merge : Merge
  ignore : Ignore
  config : Config
  */

  constructor (merge /*: Merge */, ignore /*: Ignore */, config /*: Config */) {
    this.merge = merge
    this.ignore = ignore
    this.config = config

    autoBind(this)
  }

  /* Actions */

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  async addFileAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'addFileAsync')
    ensureValidPath(doc)
    ensureValidChecksum(doc)

    doc.docType = 'file'
    assignId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.addFileAsync(side, doc)
  }

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  async updateFileAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'updateFileAsync')
    ensureValidPath(doc)
    ensureValidChecksum(doc)

    doc.docType = 'file'
    assignId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.updateFileAsync(side, doc)
  }

  // Expectations:
  //   - the folder path is present and valid
  async putFolderAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'putFolderAsync')
    ensureValidPath(doc)

    doc.docType = 'folder'
    assignId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.putFolderAsync(side, doc)
  }

  // Expectations:
  //   - the new file path is present and valid
  //   - the old file path is present and valid
  //   - the checksum is valid, if present
  //   - the two paths are not the same
  //   - the revision for the old file is present
  async moveFileAsync (side /*: SideName */, doc /*: Metadata */, was /*: Metadata */) {
    log.debug({path: doc.path, oldpath: was.path}, 'moveFileAsync')
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

  doMoveFile (side /*: SideName */, doc /*: Metadata */, was /*: Metadata */) {
    doc.docType = 'file'
    assignId(doc)
    assignId(was)
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
  async moveFolderAsync (side /*: SideName */, doc /*: Metadata */, was /*: Metadata */) {
    log.debug({path: doc.path, oldpath: was.path}, 'moveFolderAsync')
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

  doMoveFolder (side /*: SideName */, doc /*: Metadata */, was /*: Metadata */) {
    doc.docType = 'folder'
    assignId(doc)
    assignId(was)
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
  async restoreFileAsync (side /*: SideName */, was /*: Metadata */, doc /*: Metadata */) {
    log.debug({path: doc.path, oldpath: was.path}, 'restoreFileAsync')
    ensureValidPath(doc)
    ensureValidPath(was)
    ensureValidChecksum(doc)

    delete doc.trashed
    doc.docType = 'file'
    assignId(doc)
    assignId(was)
    // TODO ignore.isIgnored
    return this.merge.restoreFileAsync(side, was, doc)
  }

  // TODO add comments + tests
  async restoreFolderAsync (side /*: SideName */, was /*: Metadata */, doc /*: Metadata */) {
    log.debug({path: doc.path, oldpath: was.path}, 'restoreFolderAsync')
    ensureValidPath(doc)
    ensureValidPath(was)

    delete doc.trashed
    doc.docType = 'folder'
    assignId(doc)
    assignId(was)
    // TODO ignore.isIgnored
    return this.merge.restoreFolderAsync(side, was, doc)
  }

  // TODO add comments + tests
  async trashFileAsync (side /*: SideName */, was /*: PathObject */, doc /*: ?Metadata */) {
    log.debug({path: doc && doc.path, oldpath: was.path}, 'trashFileAsync')
    ensureValidPath(was)

    if (!doc) {
      doc = clone(was)
      doc.path = join(TRASH_DIR_NAME, was.path)
    }

    ensureValidPath(doc)
    ensureValidChecksum(doc)

    doc.trashed = true
    doc.docType = 'file'
    assignId(doc)
    assignId(was)
    // TODO ignore.isIgnored
    return this.merge.trashFileAsync(side, was, doc)
  }

  // TODO add comments + tests
  async trashFolderAsync (side /*: SideName */, was /*: PathObject */, doc /*: ?Metadata */) {
    log.debug({path: doc && doc.path, oldpath: was.path}, 'trashFolderAsync')
    ensureValidPath(was)

    if (!doc) {
      doc = clone(was)
      doc.path = join(TRASH_DIR_NAME, was.path)
    }

    ensureValidPath(doc)

    doc.trashed = true
    doc.docType = 'folder'
    assignId(doc)
    assignId(was)
    // TODO ignore.isIgnored
    return this.merge.trashFolderAsync(side, was, doc)
  }

  // Expectations:
  //   - the file path is present and valid
  async deleteFileAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'deleteFileAsync')
    ensureValidPath(doc)

    doc.docType = 'file'
    assignId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.deleteFileAsync(side, doc)
  }

  // Expectations:
  //   - the folder path is present and valid
  async deleteFolderAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'deleteFolderAsync')
    ensureValidPath(doc)

    doc.docType = 'folder'
    assignId(doc)
    if ((side === 'local') && this.ignore.isIgnored(doc)) { return }
    return this.merge.deleteFolderAsync(side, doc)
  }
}

module.exports = Prep
