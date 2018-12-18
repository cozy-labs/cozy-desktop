/* @flow */

const autoBind = require('auto-bind')
const _ = require('lodash')
const { clone } = _
const path = require('path')

const IdConflict = require('./IdConflict')
const logger = require('./logger')
const metadata = require('./metadata')
const move = require('./move')
const { otherSide } = require('./side')

/*::
import type { IdConflictInfo } from './IdConflict'
import type Local from './local'
import type { SideName, Metadata, RemoteRevisionsByID } from './metadata'
import type Pouch from './pouch'
import type { Remote } from './remote'
*/

const log = logger({
  component: 'Merge'
})

// When the local filesystem or the remote cozy detects a change, it calls this
// class to inform it (via Prep). This class will check how to operate this
// change against the data in pouchdb and then will update pouchdb. It avoids a
// lot of bogus data in pouchdb, like file created in the folder that doesn't
// exist.
//
// The documents in PouchDB have similar informations of those in CouchDB, but
// are not structured in the same way. In particular, the _id are uuid in CouchDB
// and the path to the file/folder (in a normalized form) in PouchDB.
//
// Conflicts can happen when we try to write one document for a path when
// another document already exists for the same path. We don't try to be smart
// and the rename one the two documents with a -conflict suffix. And even that
// isn't simple to implement. When the document is renamed, it fires some events
// that are not in the normal flow (rename instead of add, bogus delete) and we
// need to redirect them.
class Merge {
  /*::
  pouch: Pouch
  local: Local
  remote: Remote
  */

  constructor (pouch /*: Pouch */) {
    this.pouch = pouch
    // $FlowFixMe
    this.local = this.remote = null
    autoBind(this)
  }

  /* Helpers */

  // Be sure that the tree structure for the given path exists
  async ensureParentExistAsync (side /*: SideName */, doc /*: * */) {
    log.trace({path: doc.path}, 'ensureParentExistAsync')
    let parentId = path.dirname(doc._id)
    if (parentId === '.') { return }

    // BUG on windows with incompatible names like "D:IR"
    if (path.dirname(parentId) === parentId) { return }

    try {
      let folder = await this.pouch.db.get(parentId)
      if (folder) { return }
    } catch (err) {
      if (err.status !== 404) { log.warn(err) }
    }

    let parentDoc = {
      _id: parentId,
      path: path.dirname(doc.path),
      docType: 'folder',
      updated_at: new Date()
    }

    try {
      await this.ensureParentExistAsync(side, parentDoc)
    } catch (err) {
      throw err
    }

    return this.putFolderAsync(side, parentDoc)
  }

  // Resolve a conflict by renaming a file/folder
  // A suffix composed of -conflict- and the date is added to the path.
  async resolveConflictAsync (side /*: SideName */, doc /*: Metadata */, was /*: ?Metadata */) {
    log.warn({path: doc.path, oldpath: was && was.path, doc, was}, 'resolveConflictAsync')
    const dst = metadata.createConflictingDoc(doc)
    try {
      // $FlowFixMe
      await this[side].renameConflictingDocAsync(doc, dst.path)
    } catch (err) {
      throw err
    }
    return dst
  }

  /* Actions */

  // Add a file, if it doesn't already exist,
  // and create the tree structure if needed
  async addFileAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'addFileAsync')
    const {path} = doc
    const file /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    metadata.markSide(side, doc, file)
    const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(side, doc, file)
    if (idConflict) {
      log.warn({idConflict}, IdConflict.description(idConflict))
      await this.resolveConflictAsync(side, doc, file)
      return
    } else if (file && file.docType === 'folder') {
      return this.resolveConflictAsync(side, doc, file)
    }
    metadata.assignMaxDate(doc, file)
    if (file && metadata.sameBinary(file, doc)) {
      doc._rev = file._rev
      if (doc.size == null) { doc.size = file.size }
      if (doc.class == null) { doc.class = file.class }
      if (doc.mime == null) { doc.mime = file.mime }
      if (doc.tags == null) { doc.tags = file.tags || [] }
      if (doc.remote == null) { doc.remote = file.remote }
      if (doc.ino == null) { doc.ino = file.ino }
      if (doc.fileid == null) { doc.fileid = file.fileid }
      if (metadata.sameFile(file, doc)) {
        log.info({path}, 'up to date')
        return null
      } else {
        return this.pouch.put(doc)
      }
    }
    if (file) {
      if ((side === 'local') && (file.sides.local != null)) {
        return this.resolveInitialAddAsync(side, doc, file)
      } else {
        return this.resolveConflictAsync(side, doc, file)
      }
    }
    if (doc.tags == null) { doc.tags = [] }
    await this.ensureParentExistAsync(side, doc)
    return this.pouch.put(doc)
  }

  // When a file is modified when cozy-desktop is not running,
  // it is detected as a new file when cozy-desktop is started.
  async resolveInitialAddAsync (side /*: SideName */, doc /*: Metadata */, file /*: Metadata */) {
    if (!file.sides.remote) {
      // The file was updated on local before being pushed to remote
      return this.updateFileAsync(side, doc)
    } else if (file.sides.local && file.sides.local >= file.sides.remote) {
      // The file was updated on local after being synched to remote
      return this.updateFileAsync(side, doc)
    } else {
      // The file was updated on remote and maybe in local too
      let shortRev = file.sides.local
      try {
        const prev = await this.pouch.getPreviousRevAsync(doc._id, shortRev)
        if (prev.md5sum === doc.md5sum) {
          // The file was only updated on remote
          return null
        }
      } catch (_) {}
      // It's safer to handle it as a conflict
      if (doc.remote == null) { doc.remote = file.remote }
      return this.resolveConflictAsync('remote', doc, file)
    }
  }

  // Update a file, when its metadata or its content has changed
  async updateFileAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'updateFileAsync')
    const {path} = doc
    const file /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    metadata.markSide(side, doc, file)
    if (file && file.docType === 'folder') {
      throw new Error("Can't resolve this conflict!")
    }
    metadata.assignMaxDate(doc, file)
    if (file) {
      doc._rev = file._rev
      doc.moveFrom = file.moveFrom
      if (doc.tags == null) { doc.tags = file.tags || [] }
      if (doc.remote == null) { doc.remote = file.remote }
      if (doc.ino == null) { doc.ino = file.ino }
      if (doc.fileid == null) { doc.fileid = file.fileid }
      if (metadata.sameBinary(file, doc)) {
        if (doc.size == null) { doc.size = file.size }
        if (doc.class == null) { doc.class = file.class }
        if (doc.mime == null) { doc.mime = file.mime }
      } else if (!metadata.isAtLeastUpToDate(side, file)) {
        await this.resolveConflictAsync(side, doc, file)
        if (side === 'remote') {
          // we just renamed the remote file as a conflict
          // the old file should be dissociated from the remote
          delete file.remote
          if (file.sides) delete file.sides.remote
          await this.pouch.put(file)
        }
        return
      }
      if (metadata.sameFile(file, doc)) {
        log.info({path}, 'up to date')
        return null
      } else {
        return this.pouch.put(doc)
      }
    }
    if (doc.tags == null) { doc.tags = [] }
    await this.ensureParentExistAsync(side, doc)
    return this.pouch.put(doc)
  }

  // Create or update a folder
  async putFolderAsync (side /*: SideName */, doc /*: * */) {
    log.debug({path: doc.path}, 'putFolderAsync')
    const {path} = doc
    const folder /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    metadata.markSide(side, doc, folder)
    if (folder && folder.docType === 'file') {
      return this.resolveConflictAsync(side, doc, folder)
    }
    metadata.assignMaxDate(doc, folder)
    const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(side, doc, folder)
    if (idConflict) {
      log.warn({idConflict}, IdConflict.description(idConflict))
      await this.resolveConflictAsync(side, doc, folder)
      return
    } else if (folder) {
      doc._rev = folder._rev
      if (doc.tags == null) { doc.tags = folder.tags || [] }
      if (doc.remote == null) { doc.remote = folder.remote }
      if (doc.ino == null && folder.ino) { doc.ino = folder.ino }
      if (doc.fileid == null) { doc.fileid = folder.fileid }
      if (metadata.sameFolder(folder, doc)) {
        log.info({path}, 'up to date')
        return null
      } else {
        return this.pouch.put(doc)
      }
    }
    if (doc.tags == null) { doc.tags = [] }
    await this.ensureParentExistAsync(side, doc)
    return this.pouch.put(doc)
  }

  // Rename or move a file
  async moveFileAsync (side /*: SideName */, doc /*: Metadata */, was /*: Metadata */) /*: Promise<*> */ {
    log.debug({path: doc.path, oldpath: was.path}, 'moveFileAsync')
    const {path} = doc
    if (was.sides && !was.sides[otherSide(side)]) {
      await this.pouch.remove(metadata.upToDate(was))
      return this.addFileAsync(side, doc)
    } else if (was.sides && was.sides[side]) {
      const file /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
      const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(side, doc, file)
      if (idConflict) {
        log.warn({idConflict}, IdConflict.description(idConflict))
        await this.resolveConflictAsync(side, doc, file)
        return
      }
      metadata.markSide(side, doc, file)
      metadata.markSide(side, was, was)
      metadata.assignMaxDate(doc, was)
      if (doc.size == null) { doc.size = was.size }
      if (doc.class == null) { doc.class = was.class }
      if (doc.mime == null) { doc.mime = was.mime }
      if (doc.tags == null) { doc.tags = was.tags || [] }
      if (doc.ino == null) { doc.ino = was.ino }
      if (doc.fileid == null) { doc.fileid = was.fileid }
      move(was, doc)
      if (file && metadata.sameFile(file, doc)) {
        log.info({path}, 'up to date (move)')
        return null
      } else if (file && !doc.overwrite && doc.path === file.path) {
        const dst = await this.resolveConflictAsync(side, doc, file)
        was.moveTo = dst._id
        dst.sides = {}
        dst.sides[side] = 1
        return this.pouch.bulkDocs([was, dst])
      } else {
        if (file && doc.overwrite) doc._rev = file._rev
        await this.ensureParentExistAsync(side, doc)
        return this.pouch.bulkDocs([was, doc])
      }
    } else { // It can happen after a conflict
      return this.addFileAsync(side, doc)
    }
  }

  // Rename or move a folder (and every file and folder inside it)
  async moveFolderAsync (side /*: SideName */, doc /*: Metadata */, was /*: Metadata */, newRemoteRevs /*: ?RemoteRevisionsByID */) {
    log.debug({path: doc.path, oldpath: was.path}, 'moveFolderAsync')
    if (!was.sides || !was.sides[side]) { // It can happen after a conflict
      return this.putFolderAsync(side, doc)
    }

    const folder /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    metadata.markSide(side, doc, folder)
    metadata.markSide(side, was, was)
    metadata.assignMaxDate(doc, was)
    if (doc.tags == null) { doc.tags = was.tags || [] }
    if (doc.ino == null) { doc.ino = was.ino }
    if (doc.fileid == null) { doc.fileid = was.fileid }

    const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(side, doc, folder)
    if (idConflict) {
      log.warn({idConflict}, IdConflict.description(idConflict))
      return this.resolveConflictAsync(side, doc, folder)
    }

    if (folder && !doc.overwrite && doc.path === folder.path) {
      if (side === 'local' && !folder.sides.remote) {
        doc.overwrite = folder
      } else {
        const dst = await this.resolveConflictAsync(side, doc, folder)
        dst.sides = {}
        dst.sides[side] = 1
        return this.moveFolderRecursivelyAsync(side, dst, was, newRemoteRevs)
      }
    }

    if (folder && doc.overwrite) {
      doc.overwrite = folder
      doc._rev = folder._rev
    }
    await this.ensureParentExistAsync(side, doc)
    return this.moveFolderRecursivelyAsync(side, doc, was, newRemoteRevs)
  }

  // Move a folder and all the things inside it
  async moveFolderRecursivelyAsync (side /*: SideName */, folder /*: Metadata */, was /*: Metadata */, newRemoteRevs /*: ?RemoteRevisionsByID */) {
    const docs = await this.pouch.byRecursivePathAsync(was._id)
    move(was, folder)
    let bulk = [was, folder]

    const makeDestinationID = (doc) => doc._id.replace(was._id, folder._id)
    const existingDstRevs = await this.pouch.getAllRevsAsync(docs.map(makeDestinationID))

    for (let doc of docs) {
      let src = clone(doc)
      let dst = clone(doc)
      dst._id = makeDestinationID(doc)
      dst.path = doc.path.replace(was.path, folder.path)
      if (src.sides && src.sides[side] && !src.sides[otherSide(side)]) {
        metadata.markAsNeverSynced(src)
        metadata.markAsNew(dst)
        metadata.markSide(side, dst)
      } else {
        move.child(src, dst)
        metadata.markSide(side, dst, src)
      }

      let existingDstRev = existingDstRevs[dst._id]
      if (existingDstRev && folder.overwrite) dst._rev = existingDstRev
      const newRemoteRev = _.get(newRemoteRevs, _.get(dst, 'remote._id'))
      if (newRemoteRev) dst.remote._rev = newRemoteRev

      bulk.push(src)
      // FIXME: Find a cleaner way to pass the syncPath to the Merge
      const incompatibilities = metadata.detectPlatformIncompatibilities(dst, this.pouch.config.syncPath)
      if (incompatibilities.length > 0) dst.incompatibilities = incompatibilities
      else delete dst.incompatibilities
      bulk.push(dst)
    }
    return this.pouch.bulkDocs(bulk)
  }

  async restoreFileAsync (side /*: SideName */, was /*: Metadata */, doc /*: Metadata */) /*: Promise<*> */ {
    log.debug({path: doc.path, oldpath: was.path}, 'restoreFileAsync')
    const {path} = doc
    // TODO we can probably do something smarter for conflicts and avoiding to
    // transfer again the file
    try {
      await this.deleteFileAsync(side, was)
    } catch (err) {
      log.warn({path, err})
    }
    return this.updateFileAsync(side, doc)
  }

  async restoreFolderAsync (side /*: SideName */, was /*: Metadata */, doc /*: Metadata */) /*: Promise<*> */ {
    log.debug({path: doc.path, oldpath: was.path}, 'restoreFolderAsync')
    const {path} = doc
    // TODO we can probably do something smarter for conflicts
    try {
      await this.deleteFolderAsync(side, was)
    } catch (err) {
      log.warn({path, err})
    }
    return this.putFolderAsync(side, doc)
  }

  async doTrash (side /*: SideName */, was /*: * */, doc /*: * */) /*: Promise<void> */ {
    const {path} = doc
    const oldMetadata /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(was._id)
    if (!oldMetadata) {
      log.debug({path}, 'Nothing to trash')
      return
    }
    if (doc.docType !== oldMetadata.docType) {
      log.error({doc, oldMetadata, sentry: true}, 'Mismatch on doctype for doTrash')
      return
    }
    if (side === 'remote' && !metadata.sameBinary(oldMetadata, doc)) {
      // We have a conflict: the file was updated in local and trash on the remote.
      // We dissociate the file on the remote to be able to apply the local change.
      delete oldMetadata.remote
      if (oldMetadata.sides) delete oldMetadata.sides.remote
      return this.pouch.put(oldMetadata)
    }
    delete oldMetadata.errors
    const newMetadata = clone(oldMetadata)
    metadata.markSide(side, newMetadata, oldMetadata)
    newMetadata._id = doc._id
    newMetadata._rev = doc._rev
    newMetadata.trashed = true
    if (oldMetadata.sides && oldMetadata.sides[side]) {
      metadata.markSide(side, oldMetadata, oldMetadata)
      oldMetadata._deleted = true
      try {
        await this.pouch.put(oldMetadata)
        return
      } catch (err) {
        log.warn({path, err})
      }
    }
    return this.pouch.put(newMetadata)
  }

  async trashFileAsync (side /*: SideName */, was /*: * */, doc /*: * */) /*: Promise<void> */ {
    log.debug({path: doc.path, oldpath: was.path}, 'trashFileAsync')
    return this.doTrash(side, was, doc)
  }

  async trashFolderAsync (side /*: SideName */, was /*: * */, doc /*: * */) /*: Promise<*> */ {
    log.debug({path: doc.path, oldpath: was.path}, 'trashFolderAsync')
    const {path} = doc
    // Don't trash a folder if the other side has added a new file in it (or updated one)
    let children = await this.pouch.byRecursivePathAsync(was._id)
    children = children.reverse()
    for (let child of Array.from(children)) {
      if (child.docType === 'file' && !metadata.isUpToDate(side, child)) {
        delete was.trashed
        delete was.errors
        if (was.sides) {
          delete was.sides[side]
        } else {
          // When "unlinked" from the local side, a folder doesn't have sides
          // information.
          was.sides = {}
          was.sides[otherSide(side)] = 1
        }
        return this.putFolderAsync(otherSide(side), was)
      }
    }
    // Remove in pouchdb the sub-folders
    for (let child of Array.from(children)) {
      if (child.docType === 'folder') {
        try {
          child._deleted = true
          await this.pouch.put(child)
        } catch (err) {
          log.warn({path, err})
        }
      }
    }
    await this.doTrash(side, was, doc)
  }

  // Remove a file from PouchDB
  //
  // As the watchers often detect the deletion of a folder before the deletion
  // of the files inside it, deleteFile can be called for a file that has
  // already been removed. This is not considerated as an error.
  async deleteFileAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'deleteFileAsync')
    const file /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    if (!file) return null
    if (file.sides && file.sides[side]) {
      metadata.markSide(side, file, file)
      file._deleted = true
      delete file.errors
      return this.pouch.put(file)
    } else { // It can happen after a conflict
      return null
    }
  }

  // Remove a folder
  //
  // When a folder is removed in PouchDB, we also remove the files and folders
  // inside it to ensure consistency. The watchers often detects the deletion
  // of a nested folder after the deletion of its parent. In this case, the
  // call to deleteFolder for the child is considered as successful, even if
  // the folder is missing in pouchdb (error 404).
  async deleteFolderAsync (side /*: SideName */, doc /*: Metadata */) {
    log.debug({path: doc.path}, 'deleteFolderAsync')
    const folder /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    if (!folder) return null
    if (folder.sides && folder.sides[side]) {
      return this.deleteFolderRecursivelyAsync(side, folder)
    } else { // It can happen after a conflict
      return null
    }
  }

  // Remove a folder and every thing inside it
  async deleteFolderRecursivelyAsync (side /*: SideName */, folder /*: Metadata */) {
    let docs = await this.pouch.byRecursivePathAsync(folder._id)
    // In the changes feed, nested subfolder must be deleted
    // before their parents, hence the reverse order.
    docs = docs.reverse()
    docs.push(folder)
    const toPreserve = new Set()
    for (let doc of Array.from(docs)) {
      if (toPreserve.has(doc.path) || (doc.sides && !metadata.isUpToDate(side, doc))) {
        log.warn({path: folder.path},
          `${doc.path}: cannot be deleted with ${folder.path}: ` +
          `${doc.docType} was modified on the ${otherSide(side)} side`)
        log.info({path: doc.path}, 'Dissociating from remote...')
        delete doc.remote
        if (doc.sides) delete doc.sides.remote
        toPreserve.add(path.dirname(doc.path))
      } else {
        metadata.markSide(side, doc, doc)
        doc._deleted = true
        delete doc.errors
      }
    }
    return this.pouch.bulkDocs(docs)
  }
}

module.exports = Merge
