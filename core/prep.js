/**
 * @module core/prep
 * @flow
 */

const autoBind = require('auto-bind')
const { clone } = require('lodash')
const { join } = require('path')

const metadata = require('./metadata')
const { TRASH_DIR_NAME } = require('./remote/constants')
const logger = require('./utils/logger')

/*::
import type { Config } from './config'
import type { Ignore } from './ignore'
import type { Merge } from './merge'
import type {
  Metadata,
  SavedMetadata,
  RemoteRevisionsByID
} from './metadata'
import type { SideName } from './side'
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

  constructor(merge /*: Merge */, ignore /*: Ignore */, config /*: Config */) {
    this.merge = merge
    this.ignore = ignore
    this.config = config

    autoBind(this)
  }

  /* Actions */

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  async addFileAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'addFileAsync')
    metadata.ensureValidPath(doc)
    metadata.ensureValidChecksum(doc)

    doc.docType = 'file'
    if (side === 'local' && metadata.shouldIgnore(doc, this.ignore)) {
      return
    }
    return this.merge.addFileAsync(side, doc)
  }

  // Expectations:
  //   - the file path is present and valid
  //   - the checksum is valid, if present
  async updateFileAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'updateFileAsync')
    metadata.ensureValidPath(doc)
    metadata.ensureValidChecksum(doc)

    doc.docType = 'file'
    if (side === 'local' && metadata.shouldIgnore(doc, this.ignore)) {
      return
    }
    return this.merge.updateFileAsync(side, doc)
  }

  // Expectations:
  //   - the folder path is present and valid
  async putFolderAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'putFolderAsync')
    metadata.ensureValidPath(doc)

    doc.docType = 'folder'
    if (side === 'local' && metadata.shouldIgnore(doc, this.ignore)) {
      return
    }
    return this.merge.putFolderAsync(side, doc)
  }

  // Expectations:
  //   - the new file path is present and valid
  //   - the old file path is present and valid
  //   - the checksum is valid, if present
  //   - the two paths are not the same
  //   - the revision for the old file is present
  async moveFileAsync(
    side /*: SideName */,
    doc /*: Metadata */,
    was /*: SavedMetadata */
  ) {
    log.debug({ path: doc.path, oldpath: was.path }, 'moveFileAsync')
    const { path } = doc
    metadata.ensureValidPath(doc)
    metadata.ensureValidPath(was)
    metadata.ensureValidChecksum(doc)

    if (doc.path === was.path) {
      const msg = 'Invalid move'
      log.warn({ path, doc, was }, msg)
      throw new Error(msg)
    } else if (!was._rev) {
      const msg = 'Missing rev'
      log.warn({ path, doc, was }, msg)
      throw new Error(msg)
    }

    doc.docType = 'file'
    let docIgnored = metadata.shouldIgnore(doc, this.ignore)
    let wasIgnored = metadata.shouldIgnore(was, this.ignore)
    if (side === 'local' && docIgnored && wasIgnored) {
      return
    }
    if (side === 'local' && docIgnored) {
      return this.merge.deleteFileAsync(side, was)
    } else if (side === 'local' && wasIgnored) {
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
  async moveFolderAsync(
    side /*: SideName */,
    doc /*: Metadata */,
    was /*: SavedMetadata */,
    newRemoteRevs /*: ?RemoteRevisionsByID */
  ) {
    log.debug({ path: doc.path, oldpath: was.path }, 'moveFolderAsync')
    const { path } = doc
    metadata.ensureValidPath(doc)
    metadata.ensureValidPath(was)

    if (doc.path === was.path) {
      const msg = 'Invalid move'
      log.warn({ path, doc, was }, msg)
      throw new Error(msg)
    } else if (!was._rev) {
      const msg = 'Missing rev'
      log.warn({ path, doc, was }, msg)
      throw new Error(msg)
    }

    doc.docType = 'folder'
    let docIgnored = metadata.shouldIgnore(doc, this.ignore)
    let wasIgnored = metadata.shouldIgnore(was, this.ignore)
    if (side === 'local' && docIgnored && wasIgnored) {
      return
    }
    if (side === 'local' && docIgnored) {
      return this.merge.deleteFolderAsync(side, was)
    } else if (side === 'local' && wasIgnored) {
      return this.merge.putFolderAsync(side, doc)
    } else {
      return this.merge.moveFolderAsync(side, doc, was, newRemoteRevs)
    }
  }

  // TODO add comments + tests
  async trashFileAsync(
    side /*: SideName */,
    was /*: SavedMetadata|{path: string} */,
    doc /*: ?Metadata */
  ) {
    log.debug({ path: doc && doc.path, oldpath: was.path }, 'trashFileAsync')
    metadata.ensureValidPath(was)

    if (!doc) {
      doc = clone(was)
      doc.path = join(TRASH_DIR_NAME, was.path)
    }

    metadata.ensureValidPath(doc)
    doc.trashed = true
    doc.docType = 'file'

    // TODO metadata.shouldIgnore
    return this.merge.trashFileAsync(side, was, doc)
  }

  // TODO add comments + tests
  async trashFolderAsync(
    side /*: SideName */,
    was /*: SavedMetadata|{path: string} */,
    doc /*: ?Metadata */
  ) {
    log.debug({ path: doc && doc.path, oldpath: was.path }, 'trashFolderAsync')
    metadata.ensureValidPath(was)

    if (!doc) {
      doc = clone(was)
      doc.path = join(TRASH_DIR_NAME, was.path)
    }

    metadata.ensureValidPath(doc)
    doc.trashed = true
    doc.docType = 'folder'

    // TODO metadata.shouldIgnore
    return this.merge.trashFolderAsync(side, was, doc)
  }

  // Expectations:
  //   - the file path is present and valid
  async deleteFileAsync(side /*: SideName */, doc /*: SavedMetadata */) {
    log.debug({ path: doc.path }, 'deleteFileAsync')
    metadata.ensureValidPath(doc)

    doc.docType = 'file'
    if (side === 'local' && metadata.shouldIgnore(doc, this.ignore)) {
      return
    }
    return this.merge.deleteFileAsync(side, doc)
  }

  // Expectations:
  //   - the folder path is present and valid
  async deleteFolderAsync(side /*: SideName */, doc /*: SavedMetadata */) {
    log.debug({ path: doc.path }, 'deleteFolderAsync')
    metadata.ensureValidPath(doc)

    doc.docType = 'folder'
    if (side === 'local' && metadata.shouldIgnore(doc, this.ignore)) {
      return
    }
    return this.merge.deleteFolderAsync(side, doc)
  }
}

module.exports = Prep
