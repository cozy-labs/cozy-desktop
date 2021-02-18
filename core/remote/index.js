/** The remote side read/write interface.
 *
 * @module core/remote
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const path = require('path')
const { posix, sep } = path

const { isNote } = require('../utils/notes')
const logger = require('../utils/logger')
const measureTime = require('../utils/perfs')
const metadata = require('../metadata')
const { RemoteCozy, FetchError } = require('./cozy')
const { RemoteWarningPoller } = require('./warning_poller')
const { RemoteWatcher } = require('./watcher')
const errors = require('./errors')
const timestamp = require('../utils/timestamp')

/*::
import type EventEmitter from 'events'
import type { Readable } from 'stream'
import type { Config } from '../config'
import type { SavedMetadata } from '../metadata'
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
  other: Reader
  config: Config
  pouch: Pouch
  events: EventEmitter
  watcher: RemoteWatcher
  remoteCozy: RemoteCozy
  warningsPoller: RemoteWarningPoller
  */

  constructor({ config, prep, pouch, events } /*: RemoteOptions */) {
    this.config = config
    this.pouch = pouch
    this.events = events
    this.remoteCozy = new RemoteCozy(config)
    this.warningsPoller = new RemoteWarningPoller(this.remoteCozy, events)
    this.watcher = new RemoteWatcher(pouch, prep, this.remoteCozy, events)

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
  ) /*: Promise<Readable> */ {
    return this.remoteCozy.downloadBinary(doc.remote._id)
  }

  /** Create a folder on the remote cozy instance */
  async addFolderAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Creating folder...')

    const [parentPath, name] = dirAndName(doc.path)
    const parent /*: RemoteDoc */ = await this.remoteCozy.findDirectoryByPath(
      parentPath
    )

    try {
      const dir = await this.remoteCozy.createDirectory(
        newDocumentAttributes(name, parent._id, doc.updated_at)
      )
      metadata.updateRemote(doc, dir)
    } catch (err) {
      if (err.status !== 409) {
        throw err
      }

      log.info({ path }, 'Folder already exists')
      const remotePath = '/' + posix.join(...doc.path.split(sep))
      const dir = await this.remoteCozy.findDirectoryByPath(remotePath)
      metadata.updateRemote(doc, dir)
      return this.updateFolderAsync(doc)
    }
  }

  async addFileAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Uploading new file...')
    const stopMeasure = measureTime('RemoteWriter#addFile')

    let stream
    try {
      stream = await this.other.createReadStreamAsync(doc)
    } catch (err) {
      if (err.code === 'ENOENT') {
        log.warn({ path }, 'Local file does not exist anymore.')
        doc.deleted = true // XXX: This prevents the doc to be saved with new revs
        return doc
      }
      throw err
    }

    const [dirPath, name] = dirAndName(path)
    // FIXME: stop creating parent folder and manage missing parent error
    const dir = await this.remoteCozy.findOrCreateDirectoryByPath(dirPath)

    if (!(await this.hasEnoughSpace(doc))) {
      throw new errors.RemoteError({
        code: errors.NO_COZY_SPACE_CODE,
        message: 'Not enough space available on remote Cozy',
        err: new FetchError(
          { status: 413 },
          'The file is too big and exceeds the disk quota'
        )
      })
    }

    const created = await this.remoteCozy.createFile(stream, {
      ...newDocumentAttributes(name, dir._id, doc.updated_at),
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
    old /*: ?SavedMetadata */
  ) /*: Promise<void> */ {
    if (old && isNote(old)) {
      log.warn(
        { path: doc.path, doc, old },
        'Local note updates should not be propagated'
      )
      return
    }

    const { path } = doc
    log.info({ path }, 'Uploading new file version...')

    let stream
    try {
      stream = await this.other.createReadStreamAsync(doc)
    } catch (err) {
      if (err.code === 'ENOENT') {
        log.warn({ path }, 'Local file does not exist anymore.')
        doc.deleted = true // XXX: This prevents the doc to be saved with new revs
        return doc
      }
      throw err
    }

    if (!(await this.hasEnoughSpace(doc))) {
      throw new errors.RemoteError({
        code: errors.NO_COZY_SPACE_CODE,
        message: 'Not enough space available on remote Cozy',
        err: new FetchError(
          { status: 413 },
          'The file is too big and exceeds the disk quota'
        )
      })
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
        ifMatch: old && old.remote ? old.remote._rev : ''
      }
    )
    const updated = await this.remoteCozy.updateFileById(
      doc.remote._id,
      stream,
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

    const [newParentDirPath, newName] = dirAndName(path)
    const newParentDir = await this.remoteCozy.findDirectoryByPath(
      newParentDirPath
    )

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
      if (err.status !== 404) {
        throw err
      }

      log.warn({ path }, "Directory doesn't exist anymore. Recreating it...")
      const newRemoteDoc = await this.remoteCozy.createDirectory(
        newDocumentAttributes(newName, newParentDir._id, doc.updated_at)
      )
      metadata.updateRemote(doc, newRemoteDoc)
    }
  }

  async moveAsync(
    newMetadata /*: SavedMetadata */,
    oldMetadata /*: SavedMetadata */
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

    const [newDirPath, newName] /*: [string, string] */ = dirAndName(path)
    const newDir /*: RemoteDoc */ = await this.remoteCozy.findDirectoryByPath(
      newDirPath
    )

    const attrs = {
      name: newName,
      dir_id: newDir._id,
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
      const referencedBy = await this.remoteCozy.getReferencedBy(
        overwrite.remote._id
      )
      await this.remoteCozy.addReferencedBy(remoteId, referencedBy)
      await this.assignNewRemote(newMetadata)
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
      }
      throw err
    }
  }

  async deleteFolderAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    await this.trashAsync(doc)
    const { path } = doc

    try {
      if (await this.remoteCozy.isEmpty(doc.remote._id)) {
        log.info({ path }, 'Deleting folder from the Cozy trash...')
        await this.remoteCozy.destroyById(doc.remote._id, {
          ifMatch: doc.remote._rev
        })
      } else {
        log.warn({ path }, 'Folder is not empty and cannot be deleted!')
      }
    } catch (err) {
      if (err.status === 404) return
      throw err
    }
  }

  async assignNewRemote(doc /*: SavedMetadata */) /*: Promise<void> */ {
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

  async usesFlatDomains() /*: Promise<boolean> */ {
    let { flatSubdomains } = this.config.capabilities
    if (flatSubdomains == null) {
      ;({ flatSubdomains } = await this.remoteCozy.capabilities())
      this.config.capabilities = { flatSubdomains }
    }
    return flatSubdomains
  }
}

/** Extract the remote parent path and leaf name from a local path */
function dirAndName(localPath /*: string */) /*: [string, string] */ {
  const dir =
    '/' +
    localPath
      .split(path.sep)
      .slice(0, -1)
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

function mostRecentUpdatedAt(doc /*: SavedMetadata */) /*: string */ {
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
