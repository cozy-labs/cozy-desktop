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
const { FILE_TYPE: REMOTE_FILE_TYPE } = require('./remote/constants')

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
    return side === 'local'
      ? this.local.resolveConflict(doc)
      : this.remote.resolveConflict(doc)
  }

  /* Actions */

  // Add a file, if it doesn't already exist,
  // and create the tree structure if needed
  async addFileAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'addFileAsync')
    const file /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)

    if (file) {
      if (file.trashed) {
        return this.updateFileAsync(side, doc)
      }

      const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
        { side, doc },
        file
      )
      if (idConflict) {
        log.warn({ idConflict }, IdConflict.description(idConflict))
        return this.resolveConflictAsync(side, doc)
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

      if (file.trashed) {
        // If the existing record was marked for deletion, we only keep the
        // PouchDB attributes that will allow us to overwrite it.
        doc._id = file._id
        doc._rev = file._rev

        // Keep other side metadata if we're updating the deleted side of file
        if (side === 'remote' && file.remote && file.remote.trashed) {
          doc.local = file.local
          metadata.markSide(side, doc, file)
        } else if (side === 'local' && (!file.remote || !file.remote.trashed)) {
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

      if (metadata.equivalent(doc, file)) {
        log.info({ path: doc.path }, 'up to date')
        if (side === 'local' && !metadata.sameLocal(file.local, doc.local)) {
          if (!file.sides.local) {
            // When the updated side is missing on the existing record, it means
            // we're simply linking two equivalent existing folders so we can
            // mark the record as up-to-date.
            metadata.markAsUpToDate(doc)
          } else {
            const outdated = metadata.outOfDateSide(file)
            if (outdated) {
              // In case a change was merged but not applied, we want to make sure
              // Sync will compare the current record version with the correct
              // "previous" version (i.e. the one before the actual change was
              // merged and not the one before we merged the new local metadata).
              // Therefore, we mark the changed side once more to account for the
              // new record save.
              metadata.markSide(otherSide(outdated), doc, file)
            }
          }
          return this.pouch.put(doc)
        } else if (
          side === 'remote' &&
          !metadata.sameRemote(file.remote, doc.remote)
        ) {
          if (!file.sides.remote) {
            // When the updated side is missing on the existing record, it means
            // we're simply linking two equivalent existing folders so we can
            // mark the record as up-to-date.
            metadata.markAsUpToDate(doc)
          } else {
            const outdated = metadata.outOfDateSide(file)
            if (outdated) {
              // In case a change was merged but not applied, we want to make sure
              // Sync will compare the current record version with the correct
              // "previous" version (i.e. the one before the actual change was
              // merged and not the one before we merged the new local metadata).
              // Therefore, we mark the changed side once more to account for the
              // new record save.
              metadata.markSide(otherSide(outdated), doc, file)
            }
          }
          return this.pouch.put(doc)
        } else {
          return
        }
      }

      if (
        !metadata.sameBinary(file, doc) &&
        !metadata.isAtLeastUpToDate(side, file)
      ) {
        if (side === 'local') {
          // We have a merged but unsynced remote update so we create a conflict.
          //await this.resolveConflictAsync('local', doc, file)
          if (file.remote && file.remote.type === REMOTE_FILE_TYPE) {
            const { md5sum, size } = doc
            const localWasVersioned = await this.remote.fileContentWasVersioned(
              { md5sum, size },
              file.remote
            )
            if (localWasVersioned) {
              // We make sure Sync will overwrite the local update with the remote
              // content.
              metadata.markSide('remote', file, file)
              file.local = doc.local
              return this.pouch.put(file)
            }
          }

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
          //await this.resolveConflictAsync('remote', doc, file)
          if (
            file.md5sum &&
            file.size &&
            doc.remote &&
            doc.remote.type === REMOTE_FILE_TYPE
          ) {
            const { md5sum, size } = file
            const localWasVersioned = await this.remote.fileContentWasVersioned(
              { md5sum, size },
              doc.remote
            )
            if (localWasVersioned) {
              // We make sure Sync will overwrite the local update with the remote
              // content.
              metadata.markSide('remote', doc, file)
              return this.pouch.put(doc)
            }
          }

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
      // Any potential conflict has been dealt with

      metadata.markSide(side, doc, file)
      metadata.assignMaxDate(doc, file)
      return this.pouch.put(doc)
    }
  }

  // Create or update a folder
  async putFolderAsync(side /*: SideName */, doc /*: Metadata */) {
    log.debug({ path: doc.path }, 'putFolderAsync')

    const folder /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)
    if (!folder) {
      metadata.markSide(side, doc, folder)
      metadata.assignMaxDate(doc, folder)
      return this.pouch.put(doc)
    } else {
      if (folder.docType === 'file') {
        return this.resolveConflictAsync(side, doc)
      }

      const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
        { side, doc },
        folder
      )
      if (idConflict) {
        log.warn({ idConflict }, IdConflict.description(idConflict))
        return this.resolveConflictAsync(side, doc)
      }

      if (side === 'local' && folder.local) {
        if (
          // Ignore local events when local metadata doesn't change or only the
          // modification date changes.
          // XXX: it would be preferable to store the new local date but we need
          // to avoid merging folder changes triggered while adding content and
          // merged after we've synchronized a local renaming (i.e. the change
          // which was waiting to be dispatched is now obsolete and merging it
          // would cause issues).
          // Until we find a way to mark specific events as obsolete, our only
          // recourse is to discard these modification date changes.
          metadata.equivalentLocal(folder.local, doc.local)
        ) {
          log.debug({ path: doc.path, doc, folder }, 'Same local metadata')
          return
        }
      }

      if (folder.trashed) {
        // If the existing record was marked for deletion, we only keep the
        // PouchDB attributes that will allow us to overwrite it.
        doc._id = folder._id
        doc._rev = folder._rev

        // Keep other side metadata if we're updating the deleted side of file
        if (side === 'remote' && folder.remote && folder.remote.trashed) {
          doc.local = folder.local
          metadata.markSide(side, doc, folder)
        } else if (
          side === 'local' &&
          (!folder.remote || !folder.remote.trashed)
        ) {
          doc.remote = folder.remote
          metadata.markSide(side, doc, folder)
        } else {
          metadata.markSide(side, doc)
        }

        metadata.assignMaxDate(doc, folder)
        return this.pouch.put(doc)
      }
      // The updated file was not deleted on either side

      // Otherwise we merge the relevant attributes
      doc = {
        ..._.cloneDeep(folder),
        ...doc,
        // Tags come from the remote document and will always be empty in a new
        // local document.
        tags: doc.tags.length === 0 ? folder.tags : doc.tags
      }

      if (metadata.equivalent(folder, doc)) {
        log.info({ path: doc.path }, 'up to date')
        if (side === 'local' && !metadata.sameLocal(folder.local, doc.local)) {
          if (!folder.sides.local) {
            // When the updated side is missing on the existing record, it means
            // we're simply linking two equivalent existing folders so we can
            // mark the record as up-to-date.
            metadata.markAsUpToDate(doc)
          } else {
            const outdated = metadata.outOfDateSide(folder)
            if (outdated) {
              // In case a change was merged but not applied, we want to make sure
              // Sync will compare the current record version with the correct
              // "previous" version (i.e. the one before the actual change was
              // merged and not the one before we merged the new local metadata).
              // Therefore, we mark the changed side once more to account for the
              // new record save.
              metadata.markSide(otherSide(outdated), doc, folder)
            }
          }
          return this.pouch.put(doc)
        } else if (
          side === 'remote' &&
          !metadata.sameRemote(folder.remote, doc.remote)
        ) {
          if (!folder.sides.remote) {
            // When the updated side is missing on the existing record, it means
            // we're simply linking two equivalent existing folders so we can
            // mark the record as up-to-date.
            metadata.markAsUpToDate(doc)
          } else {
            const outdated = metadata.outOfDateSide(folder)
            if (outdated) {
              // In case a change was merged but not applied, we want to make sure
              // Sync will compare the current record version with the correct
              // "previous" version (i.e. the one before the actual change was
              // merged and not the one before we merged the new local metadata).
              // Therefore, we mark the changed side once more to account for the
              // new record save.
              metadata.markSide(otherSide(outdated), doc, folder)
            }
          }
          return this.pouch.put(doc)
        } else {
          return
        }
      }

      metadata.markSide(side, doc, folder)
      metadata.assignMaxDate(doc, folder)
      return this.pouch.put(doc)
    }
  }

  // Rename or move a file
  async moveFileAsync(
    side /*: SideName */,
    doc /*: Metadata */,
    was /*: SavedMetadata */
  ) /*: Promise<*> */ {
    log.debug({ path: doc.path, oldpath: was.path }, 'moveFileAsync')

    // If file is moved on Windows, it will never be executable so we keep the
    // existing value.
    if (side === 'local' && process.platform === 'win32') {
      doc.executable = was.executable
    }

    if ((!metadata.wasSynced(was) && !was.moveFrom) || was.trashed) {
      // The file was moved on the local filesystem but does not exist on the
      // remote Cozy so we cannot synchronize a move.
      // We convert the local move into a creation at the move destination path
      // instead.
      move.convertToDestinationAddition(side, was, doc, { updateSide: true })

      const file /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)
      if (file) {
        // The move overwrote an existing local document. To avoid having 2
        // documents with the same path in PouchDB, we erase the moved
        // document's source record and merge its new metadata as an update of
        // the overwritten document.
        await this.pouch.eraseDocument(was)
        metadata.markAsUnmerged(doc, side)
        return this.updateFileAsync(side, doc)
      } else {
        return this.addFileAsync(side, doc)
      }
    } else if (was.sides && was.sides[side]) {
      metadata.assignMaxDate(doc, was)
      move(side, was, doc)

      const file /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(doc.path)
      if (file) {
        if (file.trashed) {
          doc.overwrite = file.overwrite || file
        }

        const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
          { side, doc, was },
          file
        )
        if (idConflict) {
          log.warn({ idConflict }, IdConflict.description(idConflict))
          return this.resolveConflictAsync(side, doc)
        }

        if (doc.overwrite || metadata.isAtLeastUpToDate(side, file)) {
          // On macOS and Windows, two documents can share the same id with a
          // different path.
          // This means we'll see moves with both `file` and `doc` sharing the
          // same id when changing the file name's case or encoding and in this
          // situation we're not actually doing an overwriting move so we
          // shouldn't reuse the existing `file`'s rev nor overwrite it.
          if (file.path === doc.path) {
            doc.overwrite = file.overwrite || file
            await this.pouch.eraseDocument(file)
          }

          return this.pouch.put(doc)
        }

        if (
          doc.path === file.path &&
          file.md5sum &&
          file.size &&
          doc.remote &&
          doc.remote.type === REMOTE_FILE_TYPE
        ) {
          const { md5sum, size } = file
          const localWasVersioned = await this.remote.fileContentWasVersioned(
            { md5sum, size },
            doc.remote
          )
          if (localWasVersioned) {
            doc.overwrite = file.overwrite || file
            await this.pouch.eraseDocument(file)
            return this.pouch.put(doc)
          }
        }

        const dst = await this.resolveConflictAsync(side, doc)
        return this.pouch.put(dst)
      } else {
        return this.pouch.put(doc)
      }
    } else {
      // It can happen after a conflict
      return this.addFileAsync(side, doc)
    }
  }

  // Rename or move a folder (and every file and folder inside it)
  // TODO: handle cases where `was` has never been synced or is deleted as a
  // creation at `doc`'s location (i.e. we need to change the children's paths
  // as well).
  async moveFolderAsync(
    side /*: SideName */,
    doc /*: Metadata */,
    was /*: SavedMetadata */,
    newRemoteRevs /*: ?RemoteRevisionsByID */
  ) {
    log.debug({ path: doc.path, oldpath: was.path }, 'moveFolderAsync')

    metadata.assignMaxDate(doc, was)

    if (!metadata.wasSynced(was) || was.trashed) {
      // The folder was moved on the local filesystem but does not exist on the
      // remote Cozy so we cannot synchronize a move.
      // We convert the local move into a creation at the move destination path
      // instead.
      move.convertToDestinationAddition(side, was, doc, { updateSide: true })

      const folder /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(
        doc.path
      )
      if (folder) {
        // The move overwrote an existing local document. To avoid having 2
        // documents with the same path in PouchDB, the moved document's source
        // record was erased in `moveFolderAsync()` and we'll merge its new
        // metadata as an update of the overwritten document.

        if (metadata.isAtLeastUpToDate(side, folder)) {
          await this.pouch.eraseDocument(was)
          metadata.markAsUnmerged(doc, side)
          await this.putFolderRecursivelyAsync(side, doc, was)
        } else {
          const dst = await this.resolveConflictAsync(side, doc)
          await this.putFolderRecursivelyAsync(side, dst, was)
        }
      } else {
        await this.putFolderRecursivelyAsync(side, doc, was)
      }
    } else {
      const folder /*: ?SavedMetadata */ = await this.pouch.bySyncedPath(
        doc.path
      )
      if (folder) {
        if (folder.trashed) {
          doc.overwrite = folder.overwrite || folder
        }

        const idConflict /*: ?IdConflictInfo */ = IdConflict.detect(
          { side, doc, was },
          folder
        )
        if (idConflict) {
          log.warn({ idConflict }, IdConflict.description(idConflict))
          return this.resolveConflictAsync(side, doc)
        }

        if (doc.overwrite || metadata.isAtLeastUpToDate(side, folder)) {
          // On macOS and Windows, two documents can share the same id with a
          // different path.
          // This means we'll see moves with both `folder` and `doc` sharing the
          // same id when changing the folder name's case or encoding and in this
          // situation we're not actually doing an overwriting move so we
          // shouldn't reuse the existing `folder`'s rev nor overwrite it.
          if (folder.path === doc.path) {
            doc.overwrite = folder.overwrite || folder
            // XXX: Erasing the overwritten children's records is done in
            // `moveFolderRecursivelyAsync()`.
            await this.pouch.eraseDocument(folder)
          }
          return this.moveFolderRecursivelyAsync(side, doc, was, newRemoteRevs)
        }

        const dst = await this.resolveConflictAsync(side, doc)
        return this.moveFolderRecursivelyAsync(side, dst, was, newRemoteRevs)
      } else {
        return this.moveFolderRecursivelyAsync(side, doc, was, newRemoteRevs)
      }
    }
  }

  async putFolderRecursivelyAsync(
    side /*: SideName */,
    folder /*: Metadata  */,
    was /*: SavedMetadata */
  ) {
    await this.putFolderAsync(side, folder)

    const children = await this.pouch.byRecursivePath(was.path)
    const dstChildren = await this.pouch.byRecursivePath(folder.path)
    const makeDestinationPath = doc =>
      metadata.newChildPath(doc.path, was.path, folder.path)

    for (const child of children) {
      const dstPath = makeDestinationPath(child)
      const movedChild = { ...child, path: dstPath }

      this.updateChildIncompatibilities(movedChild)

      if (!metadata.wasSynced(child) || child.trashed) {
        // The folder was moved on the local filesystem but does not exist on the
        // remote Cozy so we cannot synchronize a move.
        // We convert the local move into a creation at the move destination path
        // instead.
        move.convertToDestinationAddition(side, child, movedChild, {
          updateSide: true
        })

        const overwrittenChild = dstChildren.find(
          dst => metadata.id(dst.path) === metadata.id(movedChild.path)
        )
        if (overwrittenChild) {
          // The move overwrote an existing local document. To avoid having 2
          // documents with the same path in PouchDB, the moved document's source
          // record was erased in `moveFolderAsync()` and we'll merge its new
          // metadata as an update of the overwritten document.
          await this.pouch.eraseDocument(child)
          metadata.markAsUnmerged(movedChild, side)
          if (movedChild.docType === 'file') {
            await this.updateFileAsync(side, movedChild)
          } else {
            await this.putFolderAsync(side, movedChild)
          }
        } else {
          if (movedChild.docType === 'file') {
            await this.updateFileAsync(side, movedChild)
          } else {
            await this.putFolderAsync(side, movedChild)
          }
        }
      } else {
        await this.moveFileAsync(side, child, movedChild)
      }
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
    const makeDestinationPath = doc =>
      metadata.newChildPath(doc.path, was.path, folder.path)

    move(side, was, folder)

    // XXX: Store all changes to be merged in bulk at the end of the method call
    let bulk = [folder]
    for (let doc of docs) {
      // Don't move children marked for deletion as we can simply propagate the
      // deletion at their original path.
      // Besides, as of today, `moveFrom` will have precedence over `trashed` in
      // Sync and the deletion won't be propagated at all.
      if (doc.trashed) continue

      // Update remote rev of documents which have been updated on the Cozy
      // after we've detected the move.
      // Useful for sub-directories as their `path` attribute is updated but we
      // don't merge them as descendant changes.
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
        const dstId = metadata.id(dst.path)
        const dstChild = dstChildren.find(
          child => metadata.id(child.path) === dstId
        )
        if (dstChild) {
          dst.overwrite = dstChild.overwrite || dstChild
          this.pouch.eraseDocument(dstChild)
        }
      }
      // TODO: manage conflicts if not overwriting and docs exist at destination?

      const singleSide = metadata.detectSingleSide(src)
      if (singleSide) {
        // XXX: We should update the side's path only if the child exists on the
        // same side as the moved folder. Otherwise, the document is still at
        // its old path on `singleSide` and the metadata should reflect this
        // even though we have to update its main path to make sure future
        // requests will find it (since we're moving its parent on `side`).
        // Local watchers are supposed to look for local `path` and the remote
        // watcher cares about _ids) so not updating the opposite side should
        // not create issues.
        move.convertToDestinationAddition(singleSide, src, dst, {
          updateSide: side === singleSide
        })
      } else {
        move.child(side, src, dst)
      }

      this.updateChildIncompatibilities(dst)

      if (side === 'local' && dst.sides.local) {
        // Update the `local` attribute of children existing in the local folder
        // FIXME: `updateLocal` will override local attributes with remote ones
        // when a remote update of `dst` has been merged but not synced yet.
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

    if (was.trashed) {
      if (metadata.isAtLeastUpToDate(side, was)) {
        // The document was already marked for deletion on the same side (e.g.
        // when trashing a folder on the remote Cozy, we'll trash its content
        // when merging the folder trashing itself and when merging the trashing
        // of its children) so we can ignore this change.
        // FIXME: we should at least save the updated side otherwise we'll end
        // up with an out-of-date remote _rev.
        return
      } else if (metadata.isAtLeastUpToDate(otherSide(side), was)) {
        log.debug(
          { path: was.path, doc: was },
          'Erasing doc already marked for deletion'
        )
        return this.pouch.eraseDocument(was)
      }
    }

    if (was.sides && was.sides[side]) {
      if (was.moveFrom) {
        const { overwrite } = was
        // We need to trash the source of the move instead of the destination
        log.debug(
          { path: was.path, oldPath: was.moveFrom.path },
          'Trashing source of move instead of destination'
        )
        delete was.moveFrom
        delete was.overwrite

        if (overwrite) {
          overwrite.trashed = true
          metadata.markSide(side, overwrite, overwrite)
          delete overwrite._rev

          await this.pouch.put(overwrite)
        }
      }

      metadata.markSide(side, was, was)
      was.trashed = true
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

  // FIXME: we should save the new remote side when merging a remote trashing or
  // deletion.
  async trashFileAsync(
    side /*: SideName */,
    trashed /*: SavedMetadata */,
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

  // Send a folder to the Trash
  //
  // When a folder is marked as deleted in PouchDB, we also mark the files and
  // folders inside it to ensure consistency.
  // The watchers often detect the deletion of a nested folder after the
  // deletion of its parent. In this case, the call to trashFolderAsync for the
  // child is considered as successful, even if the folder is already marked for
  // deletion.
  // FIXME: we should save the new remote side when merging a remote trashing or
  // deletion.
  async trashFolderAsync(
    side /*: SideName */,
    trashed /*: SavedMetadata */,
    doc /*: Metadata */
  ) /*: Promise<*> */ {
    const { path } = trashed
    log.debug({ path }, 'trashFolderAsync')
    const was /*: ?SavedMetadata */ = await this.pouch.byIdMaybe(trashed._id)
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
    for (const child of children) {
      await this.doTrash(side, child)
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
      file.trashed = true
      delete file.errors
      return this.pouch.put(file)
    } else {
      // It can happen after a conflict
      return
    }
  }

  // Remove a folder
  //
  // This method is only called for complete remote deletions (i.e. the document
  // was trashed and then completely removed from the Trash). This means we
  // don't have to keep remote metadata in the PouchDB record as the remote
  // document is unrecoverable.
  // It also means we can fetch the document from PouchDB via its _id.
  //
  // When a folder is removed in PouchDB, we also remove the files and folders
  // inside it to ensure consistency. The remote watcher will sort the deletion
  // of a folder before the deletion of its content.
  async deleteFolderAsync(side /*: SideName */, doc /*: SavedMetadata */) {
    log.debug({ path: doc.path }, 'deleteFolderAsync')
    const folder /*: ?SavedMetadata */ = await this.pouch.byIdMaybe(doc._id)

    if (!folder) {
      log.debug({ path: doc.path }, 'Nothing to delete')
      return
    }

    // In the changes feed, nested subfolder must be deleted
    // before their parents, hence the reverse order.
    const children = await this.pouch.byRecursivePath(folder.path, {
      descending: true
    })
    for (let child of children) {
      if (
        child.trashed &&
        !metadata.isAtLeastUpToDate(otherSide(side), child)
      ) {
        // No need to generate extra changes if the document was already marked
        // for deletion on the remote side.
        continue
      }

      const { moveFrom } = child

      if (moveFrom && child.local) {
        if (child.path.normalize() === child.local.path.normalize()) {
          if (
            folder.moveFrom &&
            child.moveFrom.path.startsWith(folder.moveFrom.path + path.sep)
          ) {
            // The child was moved on the local side with the deleted folder thus
            // we need to trash it on the local filesystem.
            metadata.markSide(side, child, child)
          } else {
            // The child was moved on the local side into the deleted folder thus
            // we need to trash it on the Cozy.
            metadata.markSide(otherSide(side), child, child)
            // XXX: the path displayed in logs will be the one after the child
            // was moved (and became a child of folder) which can be a bit
            // confusing but since we use the remote _id to apply actions on the
            // remote Cozy we don't really care.
          }
        } else {
          // The child was moved on the remote side into the deleted folder thus
          // we need to trash its former location on the local filesystem.
          // XXX: Since the Local module uses the main path instead of the local
          // path, we have to "revert" the remote move by changing the main path
          // back into its local value.
          // TODO: use the local path in the Local module so we don't have to deal
          // with such issues.
          child.path = child.local.path

          metadata.markSide(side, child, child)
        }
      } else if (child.sides && !child.sides[side]) {
        metadata.markSide(otherSide(side), child, child)
      } else {
        metadata.markSide(side, child, child)
      }

      child.trashed = true

      // We don't want Sync to pick up other hints than the deletion and
      // try to synchronize them.
      delete child.moveFrom
      delete child.overwrite
      delete child.errors
    }

    const { moveFrom, overwrite } = folder

    if (moveFrom && folder.local) {
      if (folder.path.normalize() === folder.local.path.normalize()) {
        if (overwrite) {
          // TODO: Should we call deleteFolderAsync if overwrite is a folder to
          // be sure we delete all its content as well?
          overwrite.trashed = true
          metadata.markSide(otherSide(side), overwrite, overwrite)

          delete overwrite.moveFrom
          delete overwrite.overwrite
          delete overwrite.errors
          delete overwrite._id
          delete overwrite._rev

          children.push(overwrite)
        }
      } else {
        // The folder was moved on the remote side before being deleted so we
        // need to trash its former location on the local filesystem.
        // XXX: Since the Local module uses the main path instead of the local
        // path, we have to "revert" the remote move by changing the main path
        // back into its local value.
        // TODO: use the local path in the Local module so we don't have to deal
        // with such issues.
        folder.path = folder.local.path
      }
    }

    metadata.markSide(side, folder, folder)
    folder.trashed = true
    // We don't want Sync to pick up other hints than the deletion and try to
    // synchronize them.
    delete folder.moveFrom
    delete folder.overwrite
    delete folder.errors

    return this.pouch.bulkDocs(children.concat(folder))
  }

  updateChildIncompatibilities(child /*: SavedMetadata */) {
    // TODO: make sure that detecting an incompatibility on a child's
    // destination path actually blocks the synchronization of the parent
    // directory.
    //
    // FIXME: Find a cleaner way to pass the syncPath to the Merge
    const incompatibilities = metadata.detectIncompatibilities(
      child,
      this.pouch.config.syncPath
    )
    if (incompatibilities.length > 0)
      child.incompatibilities = incompatibilities
    else delete child.incompatibilities
  }
}

module.exports = {
  Merge
}
