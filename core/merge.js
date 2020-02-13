/**
 * @module core/merge
 * @flow
 */

const autoBind = require('auto-bind')
const _ = require('lodash')
const path = require('path')

const IdConflict = require('./IdConflict')
const metadata = require('./metadata')
const move = require('./move')
const { otherSide } = require('./side')
const logger = require('./utils/logger')
const timestamp = require('./utils/timestamp')

/*::
import type { IdConflictInfo } from './IdConflict'
import type Local from './local'
import type { Metadata, RemoteRevisionsByID } from './metadata'
import type { Pouch } from './pouch'
import type { Remote } from './remote'
import type { SideName } from './side'
*/

const log = logger({
  component: 'Merge'
})

/** Error occuring when parent of doc being merged is missing from Pouch.
 *
 * For now, this error only occurs when merging remote changes.
 *
 * In case the parent is missing, the made-up document would be inconsistent,
 * with `sides.remote` set but no `remote._id` nor `remote._rev`. Any
 * subsequent subsequent local change could fail because of those missing.
 *
 * Regarding local changes, one could wonder whether we should adopt the same
 * behavior: made-up documents will be missing an inode. Which could result in
 * subsequent moves not being detected correctly. But at least it should not
 * prevent subsequent remote changes from being synced since the inode is not
 * used in this case.
 *
 * This error is mostly caused by a bug, either in a previous Merge/Sync run
 * or related to some watcher events order.
 */
class MergeMissingParentError extends Error {
  /*::
  doc: Metadata
  */

  constructor(doc /*: Metadata */) {
    super('Cannot merge remote change: Missing parent metadata')
    this.name = 'MergeMissingParentError'
    this.doc = doc
  }
}

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

  constructor(pouch /*: Pouch */) {
    this.pouch = pouch
    // $FlowFixMe
    this.local = this.remote = null
    autoBind(this)
  }

  /* Helpers */

  // Be sure that the tree structure for the given path exists
  async ensureParentExistAsync(side /*: SideName */, doc /*: * */) {
    log.trace({ path: doc.path }, 'ensureParentExistAsync')
    let parentId = path.dirname(doc._id)
    if (parentId === '.') {
      return
    }

    // BUG on windows with incompatible names like "D:IR"
    if (path.dirname(parentId) === parentId) {
      return
    }

    try {
      let folder = await this.pouch.db.get(parentId)
      if (folder) {
        return
      }
    } catch (err) {
      if (err.status !== 404) {
        log.warn(err)
      }
    }
    if (side === 'remote') {
      throw new MergeMissingParentError(doc)
    }

    let parentDoc = {
      _id: parentId,
      path: path.dirname(doc.path),
      docType: 'folder',
      updated_at: timestamp.fromDate(new Date()).toISOString()
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
  async resolveConflictAsync(
    side /*: SideName */,
    doc /*: Metadata */,
    was /*: ?Metadata */
  ) /*: Promise<Metadata> */ {
    log.warn(
      { path: doc.path, oldpath: was && was.path, doc, was },
      'resolveConflictAsync'
    )
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
  async addFileAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'addFileAsync')
    const { path } = doc
    const file /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    metadata.markSide(side, doc, file)
    const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
      { side, doc },
      file
    )
    if (idConflict) {
      log.warn({ idConflict }, IdConflict.description(idConflict))
      await this.resolveConflictAsync(side, doc, file)
      return
    } else if (file && file.docType === 'folder') {
      return this.resolveConflictAsync(side, doc, file)
    }
    metadata.assignMaxDate(doc, file)
    if (file && metadata.sameBinary(file, doc)) {
      doc._rev = file._rev
      if (doc.size == null) {
        doc.size = file.size
      }
      if (doc.class == null) {
        doc.class = file.class
      }
      if (doc.mime == null) {
        doc.mime = file.mime
      }
      if (doc.tags == null) {
        doc.tags = file.tags || []
      }
      if (doc.remote == null) {
        doc.remote = file.remote
      }
      if (doc.ino == null) {
        doc.ino = file.ino
      }
      if (doc.fileid == null) {
        doc.fileid = file.fileid
      }
      if (metadata.sameFile(file, doc)) {
        if (needsFileidMigration(file, doc.fileid)) {
          return this.migrateFileid(file, doc.fileid)
        }
        log.info({ path }, 'up to date')
        return null
      } else {
        return this.pouch.put(doc)
      }
    }
    if (file) {
      if (side === 'local' && file.sides.local != null) {
        return this.updateFileAsync('local', doc)
      } else {
        return this.resolveConflictAsync(side, doc, file)
      }
    }
    if (doc.tags == null) {
      doc.tags = []
    }
    await this.ensureParentExistAsync(side, doc)

    return this.pouch.put(doc)
  }

  // Update a file, when its metadata or its content has changed
  async updateFileAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'updateFileAsync')
    const { path } = doc
    const file /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    metadata.markSide(side, doc, file)
    if (file && file.docType === 'folder') {
      throw new Error("Can't resolve this conflict!")
    }
    metadata.assignMaxDate(doc, file)
    if (file) {
      doc._rev = file._rev
      doc.moveFrom = file.moveFrom
      if (doc.tags == null) {
        doc.tags = file.tags || []
      }
      if (doc.remote == null) {
        doc.remote = file.remote
      }
      if (doc.ino == null) {
        doc.ino = file.ino
      }
      if (doc.fileid == null) {
        doc.fileid = file.fileid
      }
      if (metadata.sameBinary(file, doc)) {
        if (doc.size == null) {
          doc.size = file.size
        }
        if (doc.class == null) {
          doc.class = file.class
        }
        if (doc.mime == null) {
          doc.mime = file.mime
        }
      } else if (!metadata.isAtLeastUpToDate(side, file)) {
        if (side === 'local') {
          // We have a merged but unsynced remote update and we can't create a
          // conflict because the local rename will trigger an overwrite of the
          // remote file with the local content.
          // We hope the local update isn't real (the difference between the
          // orginal content and the remotely updated content).
          metadata.markSide('remote', file, file)
          delete file.overwrite
          return this.pouch.put(file)
        } else {
          // We have an update on the same file on both sides
          // so we create a conflict
          await this.resolveConflictAsync(side, doc, file)
          // we just renamed the remote file as a conflict
          // the old file should be dissociated from the remote
          delete file.remote
          delete file.sides.remote
          metadata.markSide('local', file, file)
          return await this.pouch.put(file)
        }
      } else {
        doc.overwrite = file
      }
      if (metadata.sameFile(file, doc)) {
        log.info({ path }, 'up to date')
        return null
      } else {
        return this.pouch.put(doc)
      }
    }
    if (doc.tags == null) {
      doc.tags = []
    }
    await this.ensureParentExistAsync(side, doc)
    return this.pouch.put(doc)
  }

  // Create or update a folder
  async putFolderAsync(side /*: SideName */, doc /*: * */) {
    log.debug({ path: doc.path }, 'putFolderAsync')
    const { path } = doc
    const folder /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    metadata.markSide(side, doc, folder)
    if (folder && folder.docType === 'file') {
      return this.resolveConflictAsync(side, doc, folder)
    }
    metadata.assignMaxDate(doc, folder)
    const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
      { side, doc },
      folder
    )
    if (idConflict) {
      log.warn({ idConflict }, IdConflict.description(idConflict))
      await this.resolveConflictAsync(side, doc, folder)
      return
    } else if (folder) {
      doc._rev = folder._rev
      if (doc.tags == null) {
        doc.tags = folder.tags || []
      }
      if (doc.remote == null) {
        doc.remote = folder.remote
      }
      if (doc.ino == null && folder.ino) {
        doc.ino = folder.ino
      }
      if (doc.fileid == null) {
        doc.fileid = folder.fileid
      }
      if (metadata.sameFolder(folder, doc)) {
        if (needsFileidMigration(folder, doc.fileid)) {
          return this.migrateFileid(folder, doc.fileid)
        }
        log.info({ path }, 'up to date')
        return null
      } else {
        return this.pouch.put(doc)
      }
    }
    if (doc.tags == null) {
      doc.tags = []
    }
    await this.ensureParentExistAsync(side, doc)

    return this.pouch.put(doc)
  }

  // Rename or move a file
  async moveFileAsync(
    side /*: SideName */,
    doc /*: Metadata */,
    was /*: Metadata */
  ) /*: Promise<*> */ {
    log.debug({ path: doc.path, oldpath: was.path }, 'moveFileAsync')
    const { path } = doc
    if (!metadata.wasSynced(was)) {
      metadata.markAsUnsyncable(side, was)
      await this.pouch.put(was)
      return this.addFileAsync(side, doc)
    } else if (was.sides && was.sides[side]) {
      const file /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
      const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
        { side, doc, was },
        file
      )
      if (idConflict) {
        log.warn({ idConflict }, IdConflict.description(idConflict))
        await this.resolveConflictAsync(side, doc, file)
        return
      }
      metadata.assignMaxDate(doc, was)
      if (doc.size == null) {
        doc.size = was.size
      }
      if (doc.class == null) {
        doc.class = was.class
      } // FIXME: Seems useless since metadata.buildFile adds it
      if (doc.mime == null) {
        doc.mime = was.mime
      } // FIXME: Seems useless since metadata.buildFile adds it
      if (doc.tags == null) {
        doc.tags = was.tags || []
      }
      if (doc.ino == null) {
        doc.ino = was.ino
      }
      if (doc.fileid == null) {
        doc.fileid = was.fileid
      }
      if (doc.remote == null) {
        doc.remote = was.remote
      }
      move(side, was, doc)
      if (file && metadata.sameFile(file, doc)) {
        log.info({ path }, 'up to date (move)')
        return null
      } else if (file && !doc.overwrite && doc.path === file.path) {
        const dst = await this.resolveConflictAsync(side, doc, file)
        was.moveTo = dst._id
        dst.sides = { target: 1, [side]: 1 }
        return this.pouch.bulkDocs([was, dst])
      } else if (file && doc.overwrite) {
        doc._rev = file._rev
        await this.ensureParentExistAsync(side, doc)
        return this.pouch.bulkDocs([was, doc])
      } else {
        await this.ensureParentExistAsync(side, doc)

        return this.pouch.bulkDocs([was, doc])
      }
    } else {
      // It can happen after a conflict
      return this.addFileAsync(side, doc)
    }
  }

  // Rename or move a folder (and every file and folder inside it)
  async moveFolderAsync(
    side /*: SideName */,
    doc /*: Metadata */,
    was /*: Metadata */,
    newRemoteRevs /*: ?RemoteRevisionsByID */
  ) {
    log.debug({ path: doc.path, oldpath: was.path }, 'moveFolderAsync')
    if (!metadata.wasSynced(was)) {
      metadata.markAsUnsyncable(side, was)
      await this.pouch.put(was)
      return this.putFolderAsync(side, doc)
    }

    const folder /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
      { side, doc, was },
      folder
    )
    if (idConflict) {
      log.warn({ idConflict }, IdConflict.description(idConflict))
      return this.resolveConflictAsync(side, doc, folder)
    }

    metadata.assignMaxDate(doc, was)
    if (doc.tags == null) {
      doc.tags = was.tags || []
    }
    if (doc.ino == null) {
      doc.ino = was.ino
    }
    if (doc.fileid == null) {
      doc.fileid = was.fileid
    }
    if (doc.remote == null) {
      doc.remote = was.remote
    }

    if (folder && !doc.overwrite && doc.path === folder.path) {
      if (side === 'local' && !folder.sides.remote) {
        doc.overwrite = folder
      } else {
        const dst = await this.resolveConflictAsync(side, doc, folder)
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
  async moveFolderRecursivelyAsync(
    side /*: SideName */,
    folder /*: Metadata */,
    was /*: Metadata */,
    newRemoteRevs /*: ?RemoteRevisionsByID */
  ) {
    log.debug(
      { path: folder.path, oldpath: was.path },
      'moveFolderRecursivelyAsync'
    )
    const docs = await this.pouch.byRecursivePathAsync(was._id)

    move(side, was, folder)
    let bulk = [was, folder]

    const makeDestinationID = doc => doc._id.replace(was._id, folder._id)
    const existingDstRevs = await this.pouch.getAllRevsAsync(
      docs.map(makeDestinationID)
    )

    for (let doc of docs) {
      let src = _.cloneDeep(doc)
      let dst = _.cloneDeep(doc)
      dst._id = makeDestinationID(doc)
      dst.path = doc.path.replace(was.path, folder.path)
      // If the source needs to be overwritten, we'll take care of it during
      // Sync while it does not say anything about the existence of a document
      // at the destination.
      if (dst.overwrite) delete dst.overwrite

      const singleSide = metadata.detectSingleSide(src)
      if (singleSide) {
        move.convertToDestinationAddition(singleSide, src, dst)
      } else {
        move.child(side, src, dst)
      }

      let existingDstRev = existingDstRevs[dst._id]
      if (existingDstRev && folder.overwrite) dst._rev = existingDstRev
      const newRemoteRev = _.get(newRemoteRevs, _.get(dst, 'remote._id'))
      if (newRemoteRev) dst.remote._rev = newRemoteRev

      bulk.push(src)
      // FIXME: Find a cleaner way to pass the syncPath to the Merge
      const incompatibilities = metadata.detectIncompatibilities(
        dst,
        this.pouch.config.syncPath
      )
      if (incompatibilities.length > 0)
        dst.incompatibilities = incompatibilities
      else delete dst.incompatibilities
      bulk.push(dst)
    }
    return this.pouch.bulkDocs(bulk)
  }

  async restoreFileAsync(
    side /*: SideName */,
    was /*: Metadata */,
    doc /*: Metadata */
  ) /*: Promise<*> */ {
    log.debug({ path: doc.path, oldpath: was.path }, 'restoreFileAsync')
    const { path } = doc
    // TODO we can probably do something smarter for conflicts and avoiding to
    // transfer again the file
    try {
      await this.deleteFileAsync(side, was)
    } catch (err) {
      log.warn({ path, err })
    }
    return this.updateFileAsync(side, doc)
  }

  async restoreFolderAsync(
    side /*: SideName */,
    was /*: Metadata */,
    doc /*: Metadata */
  ) /*: Promise<*> */ {
    log.debug({ path: doc.path, oldpath: was.path }, 'restoreFolderAsync')
    const { path } = doc
    // TODO we can probably do something smarter for conflicts
    try {
      await this.deleteFolderAsync(side, was)
    } catch (err) {
      log.warn({ path, err })
    }
    return this.putFolderAsync(side, doc)
  }

  async doTrash(
    side /*: SideName */,
    was /*: * */,
    doc /*: * */
  ) /*: Promise<void> */ {
    const { path } = doc
    const oldMetadata /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(
      was._id
    )
    if (!oldMetadata) {
      log.debug({ path }, 'Nothing to trash')
      return
    }
    if (doc.docType !== oldMetadata.docType) {
      log.error(
        { doc, oldMetadata, sentry: true },
        'Mismatch on doctype for doTrash'
      )
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
    const newMetadata = _.cloneDeep(oldMetadata)
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
        log.warn({ path, err })
      }
    }
    return this.pouch.put(newMetadata)
  }

  async trashFileAsync(
    side /*: SideName */,
    was /*: * */,
    doc /*: * */
  ) /*: Promise<void> */ {
    log.debug({ path: doc.path, oldpath: was.path }, 'trashFileAsync')
    return this.doTrash(side, was, doc)
  }

  async trashFolderAsync(
    side /*: SideName */,
    was /*: * */,
    doc /*: * */
  ) /*: Promise<*> */ {
    log.debug({ path: doc.path, oldpath: was.path }, 'trashFolderAsync')
    const { path } = doc
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
          was.sides = { target: 1, [otherSide(side)]: 1 }
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
          log.warn({ path, err })
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
  async deleteFileAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'deleteFileAsync')
    const file /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    if (!file) return null
    if (file.sides && file.sides[side]) {
      metadata.markSide(side, file, file)
      file._deleted = true
      delete file.errors
      return this.pouch.put(file)
    } else {
      // It can happen after a conflict
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
  async deleteFolderAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'deleteFolderAsync')
    const folder /*: ?Metadata */ = await this.pouch.byIdMaybeAsync(doc._id)
    if (!folder) return null
    if (folder.sides && folder.sides[side]) {
      return this.deleteFolderRecursivelyAsync(side, folder)
    } else {
      // It can happen after a conflict
      return null
    }
  }

  // Remove a folder and every thing inside it
  async deleteFolderRecursivelyAsync(
    side /*: SideName */,
    folder /*: Metadata */
  ) {
    let docs = await this.pouch.byRecursivePathAsync(folder._id)
    // In the changes feed, nested subfolder must be deleted
    // before their parents, hence the reverse order.
    docs = docs.reverse()
    docs.push(folder)
    const toPreserve = new Set()
    for (let doc of Array.from(docs)) {
      if (
        toPreserve.has(doc.path) ||
        (doc.sides && !metadata.isUpToDate(side, doc))
      ) {
        log.warn(
          {
            path: doc.path,
            ancestorPath: folder.path,
            otherSide: otherSide(side)
          },
          'Cannot be deleted with ancestor: document was modified on the other side.'
        )
        log.info({ path: doc.path }, 'Dissociating from remote...')
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

  async bulkFixSideInPouch(
    {
      side,
      results,
      docs
    } /*: { side: SideName, results: { id: string, rev: string }[], docs: Metadata[] } */
  ) /*: Promise<any> */ {
    log.debug({ side, results, docs }, 'bulkFixSideInPouch')
    const fixedDocs = []
    const uniqResultsById = _.chain(results)
      .sortBy('rev')
      .reverse()
      .uniqBy('id')
      .value()
    const reusingRevs = uniqResultsById.filter(this.isReusingRev)
    for (const { id, rev } of reusingRevs) {
      const doc = _.find(docs, doc => !doc._rev && doc._id === id)
      if (doc) {
        fixedDocs.push(this.fixSide({ side, rev, doc }))
      }
    }

    if (fixedDocs.length > 0) return this.pouch.bulkDocs(fixedDocs)
  }

  async fixSideInPouch(
    {
      side,
      result,
      doc
    } /*: { side: SideName, result: { rev: string }, doc: Metadata } */
  ) /*: Promise<any> */ {
    log.debug({ side, result, doc }, 'fixSideInPouch')
    const { rev } = result

    if (!doc._rev && this.isReusingRev(result)) {
      const fixedDoc = this.fixSide({ side, rev, doc })
      return this.pouch.put(fixedDoc)
    }
  }

  isReusingRev({ rev } /*: { rev: string } */) /*: boolean */ {
    return metadata.extractRevNumber({ _rev: rev }) > 1
  }

  fixSide(
    { side, rev, doc } /*: { side: SideName, rev: string, doc: Metadata } */
  ) /*: Metadata */ {
    return _.defaults(
      {
        _rev: rev,
        sides: _.defaults(
          { [side]: metadata.extractRevNumber({ _rev: rev }) + 1 },
          doc.sides
        )
      },
      doc
    )
  }

  async migrateFileid(
    existing /*: Metadata */,
    fileid /*: string */
  ) /*: Promise<void> */ {
    log.info({ path: existing.path, fileid }, 'Migrating fileid')
    const doc = _.defaults({ fileid }, existing)
    metadata.incSides(doc)
    await this.pouch.put(doc)
  }
}

const needsFileidMigration = (
  existing /*: Metadata */,
  fileid /*: ?string */
) /*: boolean %checks */ => existing.fileid == null && fileid != null

module.exports = {
  Merge,
  MergeMissingParentError
}
