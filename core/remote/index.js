/** The remote side read/write interface.
 *
 * @module core/remote
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const path = require('path')

const logger = require('../utils/logger')
const measureTime = require('../utils/perfs')
const pathUtils = require('../utils/path')
const metadata = require('../metadata')
const { ROOT_DIR_ID, DIR_TYPE } = require('./constants')
const { RemoteCozy } = require('./cozy')
const { DirectoryNotFound, ExcludedDirError } = require('./errors')
const { RemoteWarningPoller } = require('./warning_poller')
const { RemoteWatcher } = require('./watcher')
const timestamp = require('../utils/timestamp')
const streamUtils = require('../utils/stream')

/*::
import type EventEmitter from 'events'
import type { SideName } from '../side'
import type { ProgressCallback, ReadableWithSize } from '../utils/stream'
import type { Config } from '../config'
import type {
  Metadata,
  MetadataRemoteInfo,
  MetadataRemoteDir,
  SavedMetadata
} from '../metadata'
import type { Pouch } from '../pouch'
import type Prep from '../prep'
import type { RemoteDoc } from './document'
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

  updateLastSync() {
    return this.remoteCozy.updateLastSync()
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
    log.info({ path }, 'Creating folder...')

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
          log.warn(
            { path, err: e, originalErr: err },
            'could not fetch conflicting directory'
          )
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
    log.info({ path }, 'Uploading new file...')
    const stopMeasure = measureTime('RemoteWriter#addFile')

    const [parentPath, name] = dirAndName(path)
    const parent = await this.findDirectoryByPath(parentPath)

    let stream
    try {
      stream = await this.other.createReadStreamAsync(doc)
    } catch (err) {
      if (err.code === 'ENOENT') {
        log.warn({ path }, 'Local file does not exist anymore.')
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

    stopMeasure()
  }

  async overwriteFileAsync(
    doc /*: SavedMetadata */,
    onProgress /*: ?ProgressCallback */
  ) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Uploading new file version...')

    let stream
    try {
      stream = await this.other.createReadStreamAsync(doc)
    } catch (err) {
      if (err.code === 'ENOENT') {
        log.warn({ path }, 'Local file does not exist anymore.')
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
        checksum: doc.md5sum,
        executable: doc.executable || false,
        contentLength: doc.size,
        contentType: doc.mime,
        updatedAt: mostRecentUpdatedAt(doc),
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

  async updateFileMetadataAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Updating file metadata...')

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
    log.info({ path }, 'Updating metadata...')

    const attrs = {
      updated_at: mostRecentUpdatedAt(doc)
    }
    const opts = {
      ifMatch: doc.remote._rev
    }

    try {
      const newRemoteDoc = await this.remoteCozy.updateAttributesById(
        doc.remote._id,
        attrs,
        opts
      )
      metadata.updateRemote(doc, newRemoteDoc)
    } catch (err) {
      throw err
    }
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
      { path, oldpath: oldMetadata.path },
      `Moving ${oldMetadata.docType}${
        isOverwritingTarget ? ' (with overwrite)' : ''
      }`
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

    try {
      const newRemoteDoc = await this.remoteCozy.updateAttributesById(
        remoteId,
        attrs,
        opts
      )
      metadata.updateRemote(newMetadata, newRemoteDoc)
    } catch (err) {
      throw err
    }

    if (overwrite && isOverwritingTarget) {
      try {
        const referencedBy = await this.remoteCozy.getReferencedBy(
          overwrite.remote._id
        )
        await this.remoteCozy.addReferencedBy(remoteId, referencedBy)
        await this.assignNewRemote(newMetadata)
      } catch (err) {
        if (err.status === 404) {
          log.warn(
            { path },
            `Cannot fetch references of missing ${overwrite.docType}.`
          )
          return
        }
        throw err
      }
    }
  }

  async trashAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Moving to the trash...')

    try {
      const newRemoteDoc = await this.remoteCozy.trashById(doc.remote._id, {
        ifMatch: doc.remote._rev
      })
      metadata.updateRemote(doc, newRemoteDoc)
    } catch (err) {
      if (err.status === 404) {
        log.warn({ path }, `Cannot trash remotely deleted ${doc.docType}.`)
        return
      } else if (
        err.status === 400 &&
        err.reason &&
        err.reason.errors &&
        /already in the trash/.test(err.reason.errors[0].detail)
      ) {
        log.warn({ path }, `Not trashing already trashed ${doc.docType}.`)
        return
      }
      throw err
    }
  }

  async assignNewRemote /*::<T: Metadata|SavedMetadata> */(
    doc /*: T */
  ) /*: Promise<void> */ {
    log.info({ path: doc.path }, 'Assigning new remote...')
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
      log.debug({ err }, 'Could not reach remote Cozy')
      return false
    }
  }

  async findDocByPath(fpath /*: string */) /*: Promise<?MetadataRemoteInfo> */ {
    const [parentPath, name] = dirAndName(fpath)
    const { _id: dirID } = await this.findDirectoryByPath(parentPath)

    const results = await this.remoteCozy.search({ dir_id: dirID, name })
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
    if (!dir || dir.deleted || !dir.remote || dir.docType !== 'folder') {
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

    log.warn(
      { path: conflict.path, oldpath: newMetadata.path },
      'Resolving remote conflict'
    )
    await this.moveAsync(conflict, newMetadata)

    return conflict
  }

  async includeInSync(doc /*: SavedMetadata */) /*: Promise<*> */ {
    const remoteDocs = await this.remoteCozy.search({ path: `/${doc.path}` })
    const remoteDoc = remoteDocs[0]
    if (!remoteDoc || remoteDoc.type !== 'directory') return

    await this.remoteCozy.includeInSync(remoteDoc)
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
  dirID /*: string */,
  updatedAt /*: string */
) {
  return {
    name,
    dirID,
    // We force the creation date otherwise the stack will set it with the
    // current date and could possibly update the modification date to be
    // greater.
    createdAt: updatedAt,
    updatedAt
  }
}

function mostRecentUpdatedAt /*::<T: Metadata|SavedMetadata> */(
  doc /*: T */
) /*: string */ {
  if (doc.remote && doc.remote.updated_at) {
    return timestamp.maxDate(doc.updated_at, doc.remote.updated_at)
  } else {
    return doc.updated_at
  }
}

module.exports = {
  Remote,
  dirAndName
}
