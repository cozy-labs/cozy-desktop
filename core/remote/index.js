/** The remote side read/write interface.
 *
 * @module core/remote
 * @flow
 */

const path = require('path')

const async = require('async')
const autoBind = require('auto-bind')
const Promise = require('bluebird')

const metadata = require('../metadata')
const { ROOT_DIR_ID, DIR_TYPE } = require('./constants')
const { RemoteCozy } = require('./cozy')
const {
  DirectoryNotFound,
  ExcludedDirError,
  isRetryableNetworkError
} = require('./errors')
const { RemoteWarningPoller } = require('./warning_poller')
const { RemoteWatcher } = require('./watcher')
const { logger } = require('../utils/logger')
const pathUtils = require('../utils/path')
const { measureTime } = require('../utils/perfs')
const streamUtils = require('../utils/stream')
const timestamp = require('../utils/timestamp')

/*::
import type EventEmitter from 'events'
import type { SideName } from '../side'
import type { ProgressCallback, ReadableWithSize } from '../utils/stream'
import type { Config } from '../config'
import type {
  Metadata,
  MetadataRemoteDir,
  MetadataRemoteFile,
  MetadataRemoteInfo,
  SavedMetadata
} from '../metadata'
import type { Pouch } from '../pouch'
import type Prep from '../prep'
import type { RemoteDoc, RemoteFileVersion } from './document'
import type { Reader } from '../reader'
import type { Writer } from '../writer'

export type RemoteOptions = {
  config: Config,
  events: EventEmitter,
  pouch: Pouch,
  prep: Prep
}
*/

const log = logger({
  component: 'RemoteWriter'
})

// A simplified version of the remote Root directory which will be used when
// looking for the parent directory's _id of documents at the root of the Cozy.
// The only information we care about are its _id, type and path.
const ROOT_DIR /*: MetadataRemoteDir */ = {
  _id: ROOT_DIR_ID,
  _rev: '1',
  dir_id: '',
  name: '',
  tags: [],
  created_at: '',
  updated_at: '',
  type: DIR_TYPE,
  path: '/'
}

/** `Remote` is the class that interfaces cozy-desktop with the remote Cozy.
 *
 * It uses a watcher, based on cozy-client-js, to poll for file and folder
 * changes from the remote CouchDB.
 * It also applies changes from the local filesystem on the remote cozy.
 *
 * Its `other` attribute is a reference to a {@link module:core/local|Local}
 * side instance.
 * This allows us to read from the local filesystem when writing to the remote
 * Cozy.
 */
class Remote /*:: implements Reader, Writer */ {
  /*::
  name: SideName
  other: Reader & Writer
  config: Config
  pouch: Pouch
  events: EventEmitter
  watcher: RemoteWatcher
  remoteCozy: RemoteCozy
  warningsPoller: RemoteWarningPoller
  */

  constructor({ config, prep, pouch, events } /*: RemoteOptions */) {
    this.name = 'remote'
    this.config = config
    this.pouch = pouch
    this.events = events
    this.remoteCozy = new RemoteCozy(config)
    this.warningsPoller = new RemoteWarningPoller(this.remoteCozy, events)
    this.watcher = new RemoteWatcher({
      config: this.config,
      pouch: this.pouch,
      events: this.events,
      remoteCozy: this.remoteCozy,
      prep
    })

    autoBind(this)
  }

  async start() {
    await this.watcher.start()
    return this.warningsPoller.start()
  }

  async resume() {
    await this.watcher.resume()
    return this.warningsPoller.start()
  }

  async suspend() {
    await Promise.all([this.watcher.suspend(), this.warningsPoller.stop()])
  }

  async stop() {
    await Promise.all([this.watcher.stop(), this.warningsPoller.stop()])
  }

  sendMail(args /*: any */) {
    return this.remoteCozy.createJob('sendmail', args)
  }

  unregister() {
    return this.remoteCozy.unregister()
  }

  update() {
    return this.remoteCozy.update()
  }

  updateLastSynced() {
    return this.remoteCozy.updateLastSynced()
  }

  /** Create a readable stream for the given doc */
  async createReadStreamAsync(
    doc /*: SavedMetadata */
  ) /*: Promise<ReadableWithSize> */ {
    const stream = await this.remoteCozy.downloadBinary(doc.remote._id)
    return streamUtils.withSize(stream, doc.size || 0)
  }

  /** Create a folder on the remote cozy instance */
  async addFolderAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info('Creating folder...', { path })

    const [parentPath, name] = dirAndName(doc.path)
    const parent /*: RemoteDoc */ = await this.findDirectoryByPath(parentPath)

    try {
      const dir = await this.remoteCozy.createDirectory(
        newDocumentAttributes(name, parent._id, doc.updated_at)
      )
      metadata.updateRemote(doc, dir)
    } catch (err) {
      if (err.status === 409) {
        let remoteDoc
        try {
          remoteDoc = await this.findDocByPath(path)
        } catch (e) {
          log.warn('could not fetch conflicting directory', {
            path,
            err: e,
            originalErr: err
          })
        }
        if (remoteDoc && this.remoteCozy.isExcludedDirectory(remoteDoc)) {
          throw new ExcludedDirError(path)
        }
      }
      throw err
    }
  }

  async addFileAsync(
    doc /*: SavedMetadata */,
    onProgress /*: ?ProgressCallback */
  ) /*: Promise<void> */ {
    const { path } = doc
    log.info('Uploading new file...', { path })
    const stopMeasure = measureTime('RemoteWriter#addFile')

    const [parentPath, name] = dirAndName(path)
    const parent = await this.findDirectoryByPath(parentPath)

    await async.retry(
      { times: 5, interval: 2000, errorFilter: isRetryableNetworkError },
      async () => {
        let stream
        try {
          stream = await this.other.createReadStreamAsync(doc)
        } catch (err) {
          if (err.code === 'ENOENT') {
            log.warn('Local file does not exist anymore.', { path })
            // FIXME: with this deletion marker, the record will be erased from
            // PouchDB while the remote document will remain.
            doc.trashed = true
            return doc
          }
          throw err
        }

        const source = onProgress
          ? streamUtils.withProgress(stream, onProgress)
          : stream

        const created = await this.remoteCozy.createFile(source, {
          ...newDocumentAttributes(name, parent._id, doc.updated_at),
          checksum: doc.md5sum,
          executable: doc.executable || false,
          contentLength: doc.size,
          contentType: doc.mime
        })
        metadata.updateRemote(doc, created)
      }
    )

    stopMeasure()
  }

  async overwriteFileAsync(
    doc /*: SavedMetadata */,
    onProgress /*: ?ProgressCallback */
  ) /*: Promise<void> */ {
    const { path } = doc
    log.info('Uploading new file version...', { path })

    await async.retry(
      { times: 5, interval: 2000, errorFilter: isRetryableNetworkError },
      async () => {
        let stream
        try {
          stream = await this.other.createReadStreamAsync(doc)
        } catch (err) {
          if (err.code === 'ENOENT') {
            log.warn('Local file does not exist anymore.', { path })
            // FIXME: with this deletion marker, the record will be erased from
            // PouchDB while the remote document will remain.
            doc.trashed = true
            return doc
          }
          throw err
        }

        // Object.assign gives us the opportunity to enforce required options with
        // Flow while they're only optional in the Metadata type. For example,
        // `md5sum` and `mime` are optional in Metadata because they only apply to
        // files. But we're sure we have files at this point and that they do have
        // those attributes.
        const options = Object.assign(
          {},
          {
            name: doc.remote.name,
            checksum: doc.md5sum,
            executable: doc.executable || false,
            contentLength: doc.size,
            contentType: doc.mime,
            lastModifiedDate: mostRecentUpdatedAt(doc),
            ifMatch: doc.remote._rev
          }
        )
        const source = onProgress
          ? streamUtils.withProgress(stream, onProgress)
          : stream

        const updated = await this.remoteCozy.updateFileById(
          doc.remote._id,
          source,
          options
        )
        metadata.updateRemote(doc, updated)
      }
    )
  }

  async updateFileMetadataAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info('Updating file metadata...', { path })

    const attrs = {
      executable: doc.executable || false,
      updated_at: mostRecentUpdatedAt(doc)
    }
    const opts = {
      ifMatch: doc.remote._rev
    }
    const updated = await this.remoteCozy.updateAttributesById(
      doc.remote._id,
      attrs,
      opts
    )
    metadata.updateRemote(doc, updated)
  }

  async updateFolderAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    const { path } = doc
    if (!doc.remote) {
      return this.addFolderAsync(doc)
    }
    log.info('Updating folder metadata...', { path })

    const attrs = {
      updated_at: mostRecentUpdatedAt(doc)
    }
    const opts = {
      ifMatch: doc.remote._rev
    }

    const newRemoteDoc = await this.remoteCozy.updateAttributesById(
      doc.remote._id,
      attrs,
      opts
    )
    metadata.updateRemote(doc, newRemoteDoc)
  }

  async moveAsync /*::<T: Metadata|SavedMetadata> */(
    newMetadata /*: T */,
    oldMetadata /*: T */
  ) /*: Promise<void> */ {
    const remoteId = oldMetadata.remote._id
    const { path, overwrite } = newMetadata
    const isOverwritingTarget =
      overwrite && overwrite.remote && overwrite.remote._id !== remoteId
    log.info(
      `Moving ${oldMetadata.docType}${
        isOverwritingTarget ? ' (with overwrite)' : ''
      }`,
      { path, oldpath: oldMetadata.path }
    )

    const [newParentPath, newName] /*: [string, string] */ = dirAndName(path)
    const newParent /*: MetadataRemoteDir */ = await this.findDirectoryByPath(
      newParentPath
    )

    const attrs = {
      name: newName,
      dir_id: newParent._id,
      updated_at: mostRecentUpdatedAt(newMetadata)
    }
    const opts = {
      ifMatch: oldMetadata.remote._rev
    }

    if (overwrite && isOverwritingTarget) {
      await this.trashAsync(overwrite)
    }

    const newRemoteDoc = await this.remoteCozy.updateAttributesById(
      remoteId,
      attrs,
      opts
    )
    metadata.updateRemote(newMetadata, newRemoteDoc)

    if (overwrite && isOverwritingTarget) {
      try {
        const remoteDoc = await this.remoteCozy.find(overwrite.remote._id)
        await this.remoteCozy.addReferencedBy(
          remoteId,
          remoteDoc.relations('referenced_by')
        )
        await this.assignNewRemote(newMetadata)
      } catch (err) {
        if (err.status === 404) {
          log.warn(`Cannot fetch references of missing ${overwrite.docType}.`, {
            path
          })
          return
        }
        throw err
      }
    }
  }

  async trashAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info('Moving to the trash...', { path })

    try {
      const newRemoteDoc = await this.remoteCozy.trashById(doc.remote._id, {
        ifMatch: doc.remote._rev
      })
      metadata.updateRemote(doc, newRemoteDoc)
    } catch (err) {
      if (err.status === 404) {
        log.warn(`Cannot trash remotely deleted ${doc.docType}.`, { path })
        return
      } else if (
        err.status === 400 &&
        err.reason &&
        err.reason.errors &&
        /already in the trash/.test(err.reason.errors[0].detail)
      ) {
        log.warn(`Not trashing already trashed ${doc.docType}.`, { path })
        return
      }
      throw err
    }
  }

  async assignNewRemote /*::<T: Metadata|SavedMetadata> */(
    doc /*: T */
  ) /*: Promise<void> */ {
    log.info('Assigning new remote...', { path: doc.path })
    const newRemoteDoc = await this.remoteCozy.find(doc.remote._id)
    metadata.updateRemote(doc, newRemoteDoc)
  }

  diskUsage() /*: Promise<*> */ {
    return this.remoteCozy.diskUsage()
  }

  async hasEnoughSpace(doc /*: SavedMetadata */) /*: Promise<boolean> */ {
    const { size = 0 } = doc
    return this.remoteCozy.hasEnoughSpace(size)
  }

  async ping() /*: Promise<boolean> */ {
    try {
      // FIXME: find better way to check if Cozy is reachable?
      await this.diskUsage()
      return true
    } catch (err) {
      log.warn('Could not reach remote Cozy', { err })
      return false
    }
  }

  async findDocByPath(fpath /*: string */) /*: Promise<?MetadataRemoteInfo> */ {
    const [parentPath, name] = dirAndName(fpath)
    const { _id: dir_id } = await this.findDirectoryByPath(parentPath)

    const results = await this.remoteCozy.search({ dir_id, name })
    if (results.length > 0) return results[0]
  }

  async findDirectoryByPath(
    path /*: string */
  ) /*: Promise<MetadataRemoteDir> */ {
    if (path === '.') return ROOT_DIR

    // XXX: We use the synced path instead of the remote path here as the goal
    // is to find parent directories of documents during the synchronization of
    // their changes and the parent can have been moved or renamed on the local
    // filesystem and not on the remote Cozy yet.
    // For now, the synced path is updated whenever the local or remote paths
    // are changed but we'll need to review this when we start updating it only
    // after a move has been fully synchronzed.
    const dir = await this.pouch.bySyncedPath(pathUtils.remoteToLocal(path))
    if (!dir || dir.deleted || !dir.remote || dir.docType !== metadata.FOLDER) {
      throw new DirectoryNotFound(path, this.config.cozyUrl)
    }

    return dir.remote
  }

  // Resolve the conflict created by the changes stored in `newMetadata` by
  // renaming its remote version with a conflict suffix so `newMetadata` can be
  // saved separately in PouchDB.
  async resolveConflict /*::<T: Metadata|SavedMetadata> */(
    newMetadata /*: T & { remote: MetadataRemoteInfo } */
  ) /*: Promise<?T> */ {
    const conflict = metadata.createConflictingDoc(newMetadata)

    log.info('Resolving remote conflict', {
      path: conflict.path,
      oldpath: newMetadata.path
    })
    await this.moveAsync(conflict, newMetadata)

    return conflict
  }

  async includeInSync(doc /*: SavedMetadata */) /*: Promise<*> */ {
    const remoteDoc = await this.remoteCozy.findMaybeByPath(
      pathUtils.localToRemote(doc.path)
    )
    if (!remoteDoc || remoteDoc.type !== DIR_TYPE) return

    await this.remoteCozy.includeInSync(remoteDoc)
  }

  // XXX: Careful: the current version of a remote file is not part of the old
  // versions so if the given content is the same as the current remote file
  // content, this method will return `false`.
  async fileContentWasVersioned(
    { md5sum, size } /*: { md5sum: string, size: number } */,
    remoteDoc /*: MetadataRemoteFile */
  ) /*: Promise<boolean> */ {
    const oldVersions = await this.remoteCozy.fetchOldFileVersions(remoteDoc)
    return oldVersions.some(
      version => version.md5sum === md5sum && Number(version.size) === size
    )
  }
}

/** Extract the remote parent path and leaf name from a local path */
function dirAndName(localPath /*: string */) /*: [string, string] */ {
  const dir = path
    .dirname(localPath)
    .split(path.sep)
    .join('/')
  const name = path.basename(localPath)
  return [dir, name]
}

function newDocumentAttributes(
  name /*: string */,
  dirId /*: string */,
  lastModifiedDate /*: string */
) {
  return {
    name,
    dirId,
    lastModifiedDate
  }
}

function mostRecentUpdatedAt /*::<T: Metadata|SavedMetadata> */(
  doc /*: T */
) /*: string */ {
  let date = doc.updated_at

  const remoteCreationDate = doc.remote && doc.remote.created_at
  if (remoteCreationDate) {
    date = timestamp.maxDate(date, remoteCreationDate)
  }

  const remoteModificationDate = doc.remote && doc.remote.updated_at
  if (remoteModificationDate) {
    date = timestamp.maxDate(date, remoteModificationDate)
  }

  return date
}

module.exports = {
  Remote,
  dirAndName
}
