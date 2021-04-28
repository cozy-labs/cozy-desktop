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
const { isNote } = require('./utils/notes')

/*::
import type { IdConflictInfo } from './IdConflict'
import type { Local } from './local'
import type {
  Metadata,
  MetadataRemoteInfo,
  SavedMetadata,
  RemoteRevisionsByID,
} from './metadata'
import type { Pouch } from './pouch'
import type { Remote } from './remote'
import type { SideName } from './side'
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

  constructor(pouch /*: Pouch */) {
    this.pouch = pouch
    // $FlowFixMe
    this.local = this.remote = null
    autoBind(this)
  }

  /* Helpers */

  // Resolve a conflict by renaming a file/folder
  // A suffix composed of -conflict- and the date is added to the path.
  async resolveConflictAsync(
    side /*: SideName */,
    doc /*: Metadata */
  ) /*: Promise<Metadata> */ {
    const dst = metadata.createConflictingDoc(doc)
    log.warn({ path: dst.path, oldpath: doc.path }, 'Resolving conflict')
    try {
      // $FlowFixMe
      await this[side].moveAsync(dst, doc)
    } catch (err) {
      throw err
    }
    return dst
  }

  // Resolve Cozy Note conflict when its content is updated on the local
  // filesystem and would therefore break the actual Note.
  // We always rename the remote document since this method should only be
  // called in case of a local update and the local file could still be open in
  // the user's editor and renaming it could create issues (e.g. the editor does
  // not detect the renaming and we'd create a new conflict each time the open
  // file would be saved).
  async resolveNoteConflict(doc /*: Metadata */, was /*: ?SavedMetadata */) {
    // We move the existing Cozy Note to a conflicting path since we've
    // updated it locally.
    await this.resolveConflictAsync('remote', doc)

    if (was) {
      // If we are resolving a conflict as part of move, we have a second record
      // to account for, the move source, `was`.
      // We want to make sure the remote watcher won't detect the movement of the
      // remote note as such because the file on the local filesystem has already
      // been moved.
      // So we make sure the source document is erased from PouchDB. The remote
      // watcher will then detect the new, conflicting note, as a file creation.
      // TODO: change path instead of erasing document since we won't be writing
      // to the same _id anymore.
      metadata.markAsUnsyncable(was)
      await this.pouch.put(was)
    }

    if (doc.overwrite) {
      // If this conflict would still result in a document overwrite (i.e. it's
      // an update or an overwriting move), we need to erase the existing
      // PouchDB record for the overwritten note so we can create a new record
      // in its stead.
      // The note has been renamed on the remote Cozy and will be pulled back
      // with the next remote watcher cycle.
      const { overwrite } = doc
      // TODO: change path instead of erasing document since we won't be writing
      // to the same _id anymore.
      metadata.markAsUnsyncable(overwrite)
      await this.pouch.put(overwrite)
      // We're not overwriting a document anymore
      delete doc.overwrite
    }

    // We create it at the destination location as a normal local file
    metadata.markAsUnmerged(doc, 'local')
    metadata.markSide('local', doc)
    metadata.removeNoteMetadata(doc)
    return this.addFileAsync('local', doc)
  }

  /* Actions */

  // Add a file, if it doesn't already exist,
  // and create the tree structure if needed
  async addFileAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'addFileAsync')
    const file /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)

    if (file) {
      if (file.deleted) {
        return this.updateFileAsync(side, doc)
      }

      const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
        { side, doc },
        file
      )
      if (idConflict) {
        log.warn({ idConflict }, IdConflict.description(idConflict))
        await this.resolveConflictAsync(side, doc)
        return
      }

      if (file.docType === 'folder') {
        return this.resolveConflictAsync(side, doc)
      }

      return this.updateFileAsync(side, doc)
    }

    metadata.markSide(side, doc)
    metadata.assignMaxDate(doc)

    return this.pouch.put(doc)
  }

  // Update a file, when its metadata or its content has changed
  async updateFileAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'updateFileAsync')

    const file /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)
    if (!file) {
      metadata.markSide(side, doc)
      metadata.assignMaxDate(doc)
      return this.pouch.put(doc)
    } else {
      if (file.docType === 'folder') {
        throw new Error("Can't resolve this conflict!")
      }

      if (side === 'local' && file.local) {
        if (
          // Ignore local events when local metadata doesn't change
          metadata.sameLocal(file.local, doc.local) ||
          // Ignore events when content changes but modification date does not
          (!metadata.sameBinary(file.local, doc.local) &&
            file.local.updated_at === doc.local.updated_at)
        ) {
          log.debug({ path: doc.path, doc, file }, 'Same local metadata')
          return
        }
      }
      // Any local update call is an actual modification

      if (file.deleted) {
        // If the existing record was marked for deletion, we only keep the
        // PouchDB attributes that will allow us to overwrite it.
        doc._id = file._id
        doc._rev = file._rev

        // Keep other side metadata if we're updating the deleted side of file
        if (
          side === 'remote' &&
          file.remote &&
          (file.remote._deleted || file.remote.trashed)
        ) {
          doc.local = file.local
          metadata.markSide(side, doc, file)
        } else if (
          side === 'local' &&
          (!file.remote || (!file.remote._deleted && !file.remote.trashed))
        ) {
          doc.remote = file.remote
          metadata.markSide(side, doc, file)
        } else {
          metadata.markSide(side, doc)
        }

        metadata.assignMaxDate(doc, file)
        return this.pouch.put(doc)
      }
      // The updated file was not deleted on either side

      // Otherwise we merge the relevant attributes
      doc = {
        ..._.cloneDeep(file),
        ...doc,
        // Tags come from the remote document and will always be empty in a new
        // local document.
        tags: doc.tags.length === 0 ? file.tags : doc.tags,
        // if file is updated on windows, it will never be executable so we keep
        // the existing value.
        executable:
          side === 'local' && process.platform === 'win32'
            ? file.executable
            : doc.executable
      }

      if (metadata.sameFile(doc, file)) {
        log.info({ path: doc.path }, 'up to date')
        if (side === 'local' && !metadata.sameLocal(file.local, doc.local)) {
          metadata.updateLocal(file, doc.local)
          const outdated = metadata.outOfDateSide(file)
          if (outdated) {
            // In case a change was merged but not applied, we want to make sure
            // Sync will compare the current record version with the correct
            // "previous" version (i.e. the one before the actual change was
            // merged and not the one before we merged the new local metadata).
            // Therefore, we mark the changed side once more to account for the
            // new record save.
            metadata.markSide(otherSide(outdated), file, file)
          }
          return this.pouch.put(file)
        } else {
          return
        }
      }

      if (!metadata.sameBinary(file, doc)) {
        if (side === 'local' && isNote(file)) {
          // We'll need a reference to the "overwritten" note during the conflict
          // resolution.
          doc.overwrite = file.overwrite || file
          return this.resolveNoteConflict(doc)
        } else if (!metadata.isAtLeastUpToDate(side, file)) {
          if (side === 'local') {
            // We have a merged but unsynced remote update so we create a conflict.
            await this.resolveConflictAsync('local', file)

            if (file.local) {
              // In this case we can dissociate the remote record from its local
              // counterpart that was just renamed and will be merged later.
              metadata.dissociateLocal(file)
              // We make sure Sync will detect and propagate the remote update
              metadata.markSide('remote', file, file)
              return this.pouch.put(file)
            } else {
              // TODO: should we save the new metadata anyway to make sure we
              // have up-to-date side infos?
              return
            }
          } else {
            // We have a merged but unsynced local update so we create a conflict.
            // We use `doc` and not `file` because the remote document has changed
            // and its new revision is only available in `doc`.
            await this.resolveConflictAsync('remote', doc)

            if (file.remote) {
              // In this case we can dissociate the local record from its remote
              // counterpart that was just renamed and will be fetched later.
              metadata.dissociateRemote(file)
              // We make sure Sync will detect and propagate the local update
              metadata.markSide('local', file, file)
              return this.pouch.put(file)
            } else {
              // TODO: should we save the new metadata anyway to make sure we
              // have up-to-date side infos?
              return
            }
          }
        }
      }
      // Any potential conflict has been dealt with

      metadata.markSide(side, doc, file)
      metadata.assignMaxDate(doc, file)
      return this.pouch.put(doc)
    }
  }

  // Create or update a folder
  async putFolderAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'putFolderAsync')
    const { path } = doc
    const folder /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)
    metadata.markSide(side, doc, folder)
    if (folder && folder.docType === 'file') {
      return this.resolveConflictAsync(side, doc)
    }
    metadata.assignMaxDate(doc, folder)
    const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
      { side, doc },
      folder
    )
    if (idConflict) {
      log.warn({ idConflict }, IdConflict.description(idConflict))
      await this.resolveConflictAsync(side, doc)
      return
    } else if (folder) {
      doc._id = folder._id
      doc._rev = folder._rev
      if (doc.remote == null) {
        doc.remote = folder.remote
      }
      if (doc.ino == null && folder.ino) {
        doc.ino = folder.ino
      }
      if (doc.fileid == null) {
        doc.fileid = folder.fileid
      }
      // If folder is updated on local filesystem, doc won't have metadata attribute
      if (folder.metadata && doc.metadata == null) {
        doc.metadata = folder.metadata
      }
      // If folder was updated on remote Cozy, doc won't have local attribute
      if (folder.local && doc.local == null) {
        doc.local = folder.local
      }

      if (!folder.deleted && metadata.sameFolder(folder, doc)) {
        log.info({ path }, 'up to date')
        if (side === 'local' && !metadata.sameLocal(folder.local, doc.local)) {
          metadata.updateLocal(folder, doc.local)
          const outdated = metadata.outOfDateSide(folder)
          if (outdated) {
            metadata.markSide(otherSide(outdated), folder, folder)
          }
          return this.pouch.put(folder)
        } else {
          return null
        }
      } else {
        return this.pouch.put(doc)
      }
    }

    return this.pouch.put(doc)
  }

  // Rename or move a file
  async moveFileAsync(
    side /*: SideName */,
    doc /*: Metadata */,
    was /*: SavedMetadata */
  ) /*: Promise<*> */ {
    log.debug({ path: doc.path, oldpath: was.path }, 'moveFileAsync')
    const { path } = doc

    if (!metadata.wasSynced(was) || was.deleted) {
      metadata.markAsUnsyncable(was)
      await this.pouch.put(was)

      metadata.markAsUnmerged(doc, side)
      return this.addFileAsync(side, doc)
    } else if (was.sides && was.sides[side]) {
      metadata.assignMaxDate(doc, was)
      move(side, was, doc)

      // If file is moved on Windows, it will never be executable so we keep the
      // existing value.
      if (side === 'local' && process.platform === 'win32') {
        doc.executable = was.executable
      }

      const file /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)
      if (file) {
        if (file.deleted) {
          doc.overwrite = file.overwrite || file
        }

        const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
          { side, doc, was },
          file
        )
        if (idConflict) {
          log.warn({ idConflict }, IdConflict.description(idConflict))
          await this.resolveConflictAsync(side, doc)
          return
        }

        if (doc.overwrite || metadata.isAtLeastUpToDate(side, file)) {
          // On macOS and Windows, two documents can share the same id with a
          // different path.
          // This means we'll see moves with both `file` and `doc` sharing the
          // same id when changing the file name's case or encoding and in this
          // situation we're not actually doing an overwriting move so we
          // shouldn't reuse the existing `file`'s rev nor overwrite it.
          if (file.path === doc.path) {
            doc._id = file._id
            doc._rev = file._rev
            doc.overwrite = file.overwrite || file
          }

          if (side === 'local' && isNote(was) && doc.md5sum !== was.md5sum) {
            return this.resolveNoteConflict(doc, was)
          }

          return this.pouch.bulkDocs([was, doc])
        }

        if (metadata.sameFile(file, doc)) {
          // FIXME: this code block seems unreachable. Removing it does not
          // break any test.
          // We should make sure that is correct and remove it.
          log.info({ path }, 'up to date (move)')
          if (side === 'local' && !metadata.sameLocal(file.local, doc.local)) {
            metadata.updateLocal(file, doc.local)
            const outdated = metadata.outOfDateSide(file)
            if (outdated) {
              metadata.markSide(otherSide(outdated), file, file)
            }
            return this.pouch.bulkDocs([was, file])
          } else {
            return this.pouch.put(was)
          }
        }

        const dst = await this.resolveConflictAsync(side, doc)
        move(side, was, dst)
        return this.pouch.bulkDocs([was, dst])
      } else {
        if (side === 'local' && isNote(was) && doc.md5sum !== was.md5sum) {
          return this.resolveNoteConflict(doc, was)
        }

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
    was /*: SavedMetadata */,
    newRemoteRevs /*: ?RemoteRevisionsByID */
  ) {
    log.debug({ path: doc.path, oldpath: was.path }, 'moveFolderAsync')

    metadata.assignMaxDate(doc, was)

    const folder /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)
    if (folder) {
      if (folder.deleted) {
        doc.overwrite = folder.overwrite || folder
      }

      const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
        { side, doc, was },
        folder
      )
      if (idConflict) {
        log.warn({ idConflict }, IdConflict.description(idConflict))
        await this.resolveConflictAsync(side, doc)
        return
      }

      if (doc.overwrite || metadata.isAtLeastUpToDate(side, folder)) {
        // On macOS and Windows, two documents can share the same id with a
        // different path.
        // This means we'll see moves with both `folder` and `doc` sharing the
        // same id when changing the folder name's case or encoding and in this
        // situation we're not actually doing an overwriting move so we
        // shouldn't reuse the existing `folder`'s rev nor overwrite it.
        if (folder.path === doc.path) {
          doc._id = folder._id
          doc._rev = folder._rev
          doc.overwrite = folder.overwrite || folder
        }
        return this.moveFolderRecursivelyAsync(side, doc, was, newRemoteRevs)
      }

      if (metadata.sameFolder(folder, doc)) {
        log.info({ path }, 'up to date (move)')
        // TODO: what about the content that was maybe moved ?
        return this.pouch.put(was)
      }

      const dst = await this.resolveConflictAsync(side, doc)
      return this.moveFolderRecursivelyAsync(side, dst, was, newRemoteRevs)
    } else {
      return this.moveFolderRecursivelyAsync(side, doc, was, newRemoteRevs)
    }
  }

  // Move a folder and all the things inside it
  async moveFolderRecursivelyAsync(
    side /*: SideName */,
    folder /*: Metadata  */,
    was /*: SavedMetadata */,
    newRemoteRevs /*: ?RemoteRevisionsByID */
  ) {
    log.debug(
      { path: folder.path, oldpath: was.path },
      'moveFolderRecursivelyAsync'
    )
    const docs = await this.pouch.byRecursivePath(was.path)
    const dstChildren = await this.pouch.byRecursivePath(folder.path)

    const singleSide = metadata.detectSingleSide(was)
    if (singleSide) {
      move.convertToDestinationAddition(singleSide, was, folder)
    } else {
      move(side, was, folder)
    }
    let bulk = [was, folder]

    const makeDestinationPath = doc =>
      metadata.newChildPath(doc.path, was.path, folder.path)
    const existingDstRevs = await this.pouch.getAllRevs(
      docs.map(makeDestinationPath)
    )

    for (let doc of docs) {
      // Don't move children marked for deletion as we can simply propagate the
      // deletion at their original path.
      // Besides, as of today, `moveFrom` will have precedence over `deleted` in
      // Sync and the deletion won't be propagated at all.
      if (doc.deleted) continue

      // Update remote rev of documents which have been updated on the Cozy
      // after we've detected the move.
      const newRemoteRev = _.get(newRemoteRevs, _.get(doc, 'remote._id'))
      if (newRemoteRev) doc.remote._rev = newRemoteRev

      const src = _.cloneDeep(doc)
      const dst = _.cloneDeep(doc)
      dst.path = makeDestinationPath(doc)

      // If the source needs to be overwritten, we'll take care of it during
      // Sync while it does not say anything about the existence of a document
      // at the destination.
      if (dst.overwrite) delete dst.overwrite

      if (folder.overwrite) {
        const dstChild = dstChildren.find(
          child => metadata.id(child.path) === metadata.id(dst.path)
        )
        if (dstChild) {
          dst._id = dstChild._id
          dst._rev = dstChild._rev
          dst.overwrite = dstChild.overwrite || dstChild
        }
      }
      // TODO: manage conflicts if not overwriting and docs exist at destination?

      const singleSide = metadata.detectSingleSide(src)
      if (singleSide) {
        move.convertToDestinationAddition(singleSide, src, dst)
      } else {
        move.child(side, src, dst)
      }

      bulk.push(src)

      const existingDstRev = existingDstRevs[metadata.id(dst.path)]
      // Filtering out deleted destination docs would mean failing to save the new version.
      // However, replacing the deleted docs will mean failing to propagate the change.
      if (existingDstRev && folder.overwrite) {
        dst._rev = existingDstRev
      }

      // FIXME: Find a cleaner way to pass the syncPath to the Merge
      const incompatibilities = metadata.detectIncompatibilities(
        dst,
        this.pouch.config.syncPath
      )
      if (incompatibilities.length > 0)
        dst.incompatibilities = incompatibilities
      else delete dst.incompatibilities

      if (side === 'local' && dst.sides.local) {
        // Update the local attribute of children existing in the local folder
        metadata.updateLocal(dst)
      } else if (side === 'remote' && dst.sides.remote) {
        // Update the remote attribute of children existing in the remote folder
        metadata.updateRemote(dst, { path: dst.path })
      }

      bulk.push(dst)

      if (folder.overwrite) {
        // If the overwriting folder has a deep hierarchy, there's a good chance
        // we'll end up merging the movement of its child folders before we
        // merge the movement of the folder itself.
        // In this situation, the Sync would apply the movement of the children
        // first as well and when we'll apply the overwriting movement of the
        // folder, we'll lose its previously moved content.
        // To avoid this, we'll update the moved children again to mark them as
        // child movements and remove any `overwrite` markers since the
        // overwrite will happen with their parent.
        for (const dstChild of dstChildren) {
          if (
            !bulk.find(
              doc => metadata.id(doc.path) === metadata.id(dstChild.path)
            ) &&
            metadata.outOfDateSide(dstChild) === otherSide(side) &&
            dstChild.moveFrom
          ) {
            metadata.markSide(side, dstChild, dstChild)
            dstChild.moveFrom.childMove = true
            if (dstChild.overwrite) delete dstChild.overwrite
            bulk.push(dstChild)
          }
        }
      }
    }
    return this.pouch.bulkDocs(bulk)
  }

  async doTrash(
    side /*: SideName */,
    was /*: SavedMetadata */
  ) /*: Promise<void> */ {
    log.debug({ path: was.path, side, was }, 'doTrash')

    delete was.errors

    if (
      was.deleted &&
      metadata.isAtLeastUpToDate(otherSide(side), was) &&
      !metadata.isAtLeastUpToDate(side, was)
    ) {
      log.debug(
        { path: was.path, doc: was },
        'Erasing doc already marked for deletion'
      )
      return this.pouch.eraseDocument(was)
    }

    if (was.sides && was.sides[side]) {
      if (was.moveFrom) {
        // We need to trash the source of the move instead of the destination
        const { moveFrom, overwrite } = was
        log.debug(
          { path: was.path, oldPath: moveFrom.path },
          'Trashing source of move instead of destination'
        )

        // The file isn't moved anymore.
        delete moveFrom.moveTo
        // It will be considered as a new record by PouchDB sicne it was
        // _deleted. So we need to remove the revision.
        delete moveFrom._rev
        // We also remove the _deleted attribute since we only want it marked
        // for deletion now.
        delete moveFrom._deleted

        // Mark source for deletion
        metadata.markSide(side, moveFrom, moveFrom)
        moveFrom.deleted = true

        const docs = [moveFrom]
        if (overwrite) {
          // Mark overwritten doc for deletion
          metadata.removeActionHints(overwrite)
          overwrite.deleted = true
          // They share the same _id
          overwrite._rev = was._rev
          metadata.markSide(side, overwrite, was)

          docs.push(overwrite)
        } else {
          // Discard move destination record
          metadata.markAsUnsyncable(was)

          docs.push(was)
        }
        return this.pouch.bulkDocs(docs)
      }

      metadata.markSide(side, was, was)
      was.deleted = true
      try {
        return await this.pouch.put(was)
      } catch (err) {
        log.warn({ path: was.path, err })
        // Do we really want to save a trashed was in this situation? It will
        // probably fail as well.
      }
    }

    was.trashed = true
    return this.pouch.put(was)
  }

  async trashFileAsync(
    side /*: SideName */,
    trashed /*: SavedMetadata|{path: string} */,
    doc /*: Metadata */
  ) /*: Promise<void> */ {
    const { path } = trashed
    log.debug({ path }, 'trashFileAsync')
    let was /*: ?SavedMetadata */
    // $FlowFixMe _id exists in SavedMetadata
    if (trashed._id != null) {
      was = await this.pouch.byIdMaybe(trashed._id)
    } else {
      was = await this.pouch.bySyncedPath(trashed.path)
    }

    if (!was) {
      log.debug({ path }, 'Nothing to trash')
      return
    } else if (doc.docType !== was.docType || was.docType !== 'file') {
      log.error(
        { doc, was, sentry: true },
        'Mismatch on doctype for trashFileAsync'
      )
      return
    }

    if (was.local && was.remote && !metadata.isAtLeastUpToDate(side, was)) {
      // File has changed on the other side
      if (was.moveFrom) {
        // The file was moved and we don't want to delete it as we think users
        // delete "paths". This is made possible because:
        // - we use the `local` path to fetch the PouchDB record in the Atom
        //   dispatch step (FIXME: use `byLocalPath` in Chokidar watcher)
        // - we use the `remote` _id to fetch the PouchDB record in the remote
        //   watcher
        // We'll dissociate the moved side from the trashed one so it can be
        // sent again by Sync.
        if (side === 'remote') {
          // FIXME: We keep the moveFrom and remote rev so we can undo the
          // remote trashing. But, this will lead the client to move a `trashed`
          // document outside the remote Trash which should never happen.
          // In this situation we should restore the remote document first and
          // then move it to its final destination.
          was.remote._rev = doc.remote._rev
          was.moveFrom.remote._rev = doc.remote._rev
        } else {
          // We remove the hint that the file should be moved since it has
          // actually been deleted locally and should be recreated instead.
          delete was.moveFrom
          // The file was deleted locally so it should not have a local side so we
          // can re-create it.
          metadata.dissociateLocal(was)
        }
        return this.pouch.put(was)
      }

      if (!metadata.sameBinary(was.local, was.remote)) {
        // The record is not up-to-date on the trashed side and we're not dealing
        // with a moved file so we have a conflict: the file was updated on one
        // side and trashed on the other. We dissociate the trashed side metadata
        // to be able to apply the content update as a file addition.
        if (side === 'remote') metadata.dissociateRemote(was)
        else metadata.dissociateLocal(was)
        return this.pouch.put(was)
      }
    }

    return this.doTrash(side, was)
  }

  async trashFolderAsync(
    side /*: SideName */,
    trashed /*: SavedMetadata|{path: string} */,
    doc /*: Metadata */
  ) /*: Promise<*> */ {
    const { path } = trashed
    log.debug({ path }, 'trashFolderAsync')
    let was /*: ?SavedMetadata */
    // $FlowFixMe _id exists in SavedMetadata
    if (trashed._id != null) {
      was = await this.pouch.byIdMaybe(trashed._id)
    } else {
      was = await this.pouch.bySyncedPath(trashed.path)
    }

    if (!was) {
      log.debug({ path }, 'Nothing to trash')
      return
    } else if (doc.docType !== was.docType) {
      log.error(
        { doc, was, sentry: true },
        'Mismatch on doctype for trashFolderAsync'
      )
      return
    }

    // Don't trash a folder if the other side has added a new file in it (or updated one)
    const children = await this.pouch.byRecursivePath(was.path, {
      descending: true
    })
    for (let child of Array.from(children)) {
      if (
        child.docType === 'file' &&
        !child.deleted &&
        !metadata.isUpToDate(side, child)
      ) {
        // The parent folder was deleted on `side` so we remove this part anyway
        if (side === 'local') {
          metadata.dissociateLocal(was)
        } else {
          metadata.dissociateRemote(was)
        }
        metadata.markSide(otherSide(side), was, was)
        delete was.errors
        // Remove deletion markers as we want the folder to be recreated on
        // `side` by Sync.
        delete was.trashed
        delete was.deleted
        // TODO: why prevent removing all files that were up-to-date?
        // Does this actually prevent removing the other files??
        return this.pouch.put(was)
      }
    }
    // Remove in pouchdb the sub-folders
    //
    // TODO: We could only one loop if the update of one child would not prevent
    // the trashing of the other children.
    for (let child of Array.from(children)) {
      if (child.docType === 'folder') {
        try {
          child.deleted = true
          await this.pouch.put(child)
        } catch (err) {
          log.warn({ path, err })
        }
      }
    }
    await this.doTrash(side, was)
  }

  // Remove a file from PouchDB
  //
  // As the watchers often detect the deletion of a folder before the deletion
  // of the files inside it, deleteFile can be called for a file that has
  // already been removed. This is not considered as an error.
  async deleteFileAsync(side /*: SideName */, doc /*: SavedMetadata */) {
    log.debug({ path: doc.path }, 'deleteFileAsync')
    const file /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)

    if (!file) {
      log.debug({ path }, 'Nothing to delete')
      return
    }

    if (file.moveFrom) {
      // We don't want Sync to pick up this move hint and try to synchronize a
      // move so we delete it.
      delete file.moveFrom

      if (side === 'remote') {
        // The file was moved locally and we don't want to delete it as we think
        // users delete "paths" but the file was completely destroyed on the
        // Cozy and cannot be restored from the trash so we dissociate our
        // record from its previous remote version to force its re-upload.
        metadata.dissociateRemote(file)
        return this.pouch.put(file)
      }
    }
    if (file.sides && file.sides[side]) {
      metadata.markSide(side, file, file)
      file.deleted = true
      delete file.errors
      return this.pouch.put(file)
    } else {
      // It can happen after a conflict
      return
    }
  }

  // Remove a folder
  //
  // When a folder is removed in PouchDB, we also remove the files and folders
  // inside it to ensure consistency. The watchers often detects the deletion
  // of a nested folder after the deletion of its parent. In this case, the
  // call to deleteFolder for the child is considered as successful, even if
  // the folder is missing in pouchdb (error 404).
  async deleteFolderAsync(side /*: SideName */, doc /*: SavedMetadata */) {
    log.debug({ path: doc.path }, 'deleteFolderAsync')
    const folder /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)

    if (!folder) {
      log.debug({ path }, 'Nothing to delete')
      return
    }

    if (folder.moveFrom) {
      // We don't want Sync to pick up this move hint and try to synchronize a
      // move so we delete it.
      delete folder.moveFrom
    }

    if (folder.sides && folder.sides[side]) {
      return this.deleteFolderRecursivelyAsync(side, folder)
    } else {
      // It can happen after a conflict
      return
    }
  }

  // Remove a folder and every thing inside it
  async deleteFolderRecursivelyAsync(
    side /*: SideName */,
    folder /*: SavedMetadata */
  ) {
    // In the changes feed, nested subfolder must be deleted
    // before their parents, hence the reverse order.
    const docs = await this.pouch.byRecursivePath(folder.path, {
      descending: true
    })
    const toPreserve = new Set()
    for (let doc of docs) {
      if (doc.deleted) continue

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
        metadata.dissociateRemote(doc)
        toPreserve.add(path.dirname(doc.path))
      } else {
        metadata.markSide(side, doc, doc)
        doc.deleted = true
        delete doc.errors
      }
    }

    metadata.markSide(side, folder, folder)
    folder.deleted = true
    delete folder.errors
    docs.push(folder)

    return this.pouch.bulkDocs(docs)
  }
}

module.exports = {
  Merge
}
