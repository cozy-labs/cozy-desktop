/** The remote side read/write interface.
 *
 * @module core/remote
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const path = require('path')
const { posix, sep } = path

const { RemoteCozy } = require('./cozy')
const { RemoteWarningPoller } = require('./warning_poller')
const { RemoteWatcher } = require('./watcher')
const { isNote } = require('../utils/notes')
const { withContentLength } = require('../reader')
const logger = require('../utils/logger')
const measureTime = require('../utils/perfs')

/*::
import type EventEmitter from 'events'
import type { Config } from '../config'
import type { Metadata } from '../metadata'
import type { Pouch } from '../pouch'
import type Prep from '../prep'
import type { RemoteDoc } from './document'
import type { ReadableWithContentLength, Reader } from '../reader' // eslint-disable-line
import type { Writer } from '../writer'
*/

const log = logger({
  component: 'RemoteWriter'
})

/*::
export type RemoteOptions = {
  config: Config,
  events: EventEmitter,
  pouch: Pouch,
  prep: Prep
}
*/

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

  start() {
    return this.watcher.start().then(() => this.warningsPoller.start())
  }

  stop() {
    return Promise.all([this.watcher.stop(), this.warningsPoller.stop()])
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
    doc /*: Metadata */
  ) /*: Promise<ReadableWithContentLength> */ {
    const stream = await this.remoteCozy.downloadBinary(doc.remote._id)
    return withContentLength(stream, doc.size)
  }

  /** Create a folder on the remote cozy instance */
  async addFolderAsync(doc /*: Metadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Creating folder...')

    const [parentPath, name] = dirAndName(doc.path)
    const parent /*: RemoteDoc */ = await this.remoteCozy.findDirectoryByPath(
      parentPath
    )
    let dir /*: RemoteDoc */

    try {
      dir = await this.remoteCozy.createDirectory(
        newDocumentAttributes(name, parent._id, doc.updated_at)
      )
    } catch (err) {
      if (err.status !== 409) {
        throw err
      }

      log.info({ path }, 'Folder already exists')
      const remotePath = '/' + posix.join(...doc.path.split(sep))
      dir = await this.remoteCozy.findDirectoryByPath(remotePath)
    }

    doc.remote = {
      _id: dir._id,
      _rev: dir._rev
    }
  }

  async addFileAsync(doc /*: Metadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Uploading new file...')
    const stopMeasure = measureTime('RemoteWriter#addFile')

    let stream /*: ReadableWithContentLength */
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
    const dir = await this.remoteCozy.findOrCreateDirectoryByPath(dirPath)

    const created = await this.remoteCozy.createFile(stream, {
      ...newDocumentAttributes(name, dir._id, doc.updated_at),
      checksum: doc.md5sum,
      executable: doc.executable || false,
      contentLength: stream.contentLength,
      contentType: doc.mime
    })

    doc.remote = {
      _id: created._id,
      _rev: created._rev
    }

    stopMeasure()
  }

  async overwriteFileAsync(
    doc /*: Metadata */,
    old /*: ?Metadata */
  ) /*: Promise<void> */ {
    if (old && isNote(old)) {
      log.error(
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

    const options = {
      contentType: doc.mime,
      checksum: doc.md5sum,
      updatedAt: doc.updated_at,
      executable: doc.executable || false,
      ifMatch: ''
    }
    if (old && old.remote) {
      options.ifMatch = old.remote._rev
    }
    const updated = await this.remoteCozy.updateFileById(
      doc.remote._id,
      stream,
      options
    )

    doc.remote._rev = updated._rev
  }

  async updateFileMetadataAsync(
    doc /*: Metadata */,
    old /*: any */
  ) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Updating file metadata...')

    const attrs = {
      executable: doc.executable || false,
      updated_at: doc.updated_at
    }
    const opts = {
      ifMatch: old.remote._rev
    }
    const updated = await this.remoteCozy.updateAttributesById(
      old.remote._id,
      attrs,
      opts
    )

    doc.remote = {
      _id: updated._id,
      _rev: updated._rev
    }
  }

  async updateFolderAsync(
    doc /*: Metadata */,
    old /*: Metadata */
  ) /*: Promise<void> */ {
    const { path } = doc
    if (!old.remote) {
      return this.addFolderAsync(doc)
    }
    log.info({ path }, 'Updating metadata...')

    const [newParentDirPath, newName] = dirAndName(path)
    const newParentDir = await this.remoteCozy.findDirectoryByPath(
      newParentDirPath
    )
    let newRemoteDoc /*: RemoteDoc */

    const attrs = {
      name: newName,
      dir_id: newParentDir._id,
      updated_at: doc.updated_at
    }
    const opts = {
      ifMatch: old.remote._rev
    }

    try {
      newRemoteDoc = await this.remoteCozy.updateAttributesById(
        old.remote._id,
        attrs,
        opts
      )
    } catch (err) {
      if (err.status !== 404) {
        throw err
      }

      log.warn({ path }, "Directory doesn't exist anymore. Recreating it...")
      newRemoteDoc = await this.remoteCozy.createDirectory(
        newDocumentAttributes(newName, newParentDir._id, doc.updated_at)
      )
    }

    doc.remote = {
      _id: newRemoteDoc._id,
      _rev: newRemoteDoc._rev
    }
  }

  async moveAsync(
    newMetadata /*: Metadata */,
    oldMetadata /*: Metadata */
  ) /*: Promise<void> */ {
    const { path, overwrite } = newMetadata
    const isOverwritingTarget =
      overwrite &&
      overwrite.remote &&
      overwrite.remote._id !== oldMetadata.remote._id
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
      updated_at: newMetadata.updated_at
    }
    const opts = {
      ifMatch: oldMetadata.remote._rev
    }

    if (overwrite && isOverwritingTarget) {
      await this.trashAsync(overwrite)
    }

    const newRemoteDoc /*: RemoteDoc */ = await this.remoteCozy.updateAttributesById(
      oldMetadata.remote._id,
      attrs,
      opts
    )
    newMetadata.remote = {
      _id: newRemoteDoc._id, // XXX: Why do we reassign id? Isn't it the same as before?
      _rev: newRemoteDoc._rev
    }

    if (overwrite && isOverwritingTarget) {
      const referencedBy = await this.remoteCozy.getReferencedBy(
        overwrite.remote._id
      )
      const { _rev } = await this.remoteCozy.addReferencedBy(
        newRemoteDoc._id,
        referencedBy
      )
      newMetadata.remote._rev = _rev
    }
  }

  async trashAsync(doc /*: Metadata */) /*: Promise<void> */ {
    const { path } = doc
    log.info({ path }, 'Moving to the trash...')

    let newRemoteDoc /*: RemoteDoc */
    try {
      newRemoteDoc = await this.remoteCozy.trashById(doc.remote._id, {
        ifMatch: doc.remote._rev
      })
    } catch (err) {
      if (err.status === 404) {
        log.warn({ path }, `Cannot trash remotely deleted ${doc.docType}.`)
        return
      }
      throw err
    }
    doc.remote._rev = newRemoteDoc._rev
  }

  async deleteFolderAsync(doc /*: Metadata */) /*: Promise<void> */ {
    await this.trashAsync(doc)
    const { path } = doc

    try {
      if (await this.remoteCozy.isEmpty(doc.remote._id)) {
        log.info({ path }, 'Deleting folder from the Cozy trash...')
        const opts = doc.remote._rev ? { ifMatch: doc.remote._rev } : undefined
        await this.remoteCozy.destroyById(doc.remote._id, opts)
      } else {
        log.warn({ path }, 'Folder is not empty and cannot be deleted!')
      }
    } catch (err) {
      if (err.status === 404) return
      throw err
    }
  }

  async assignNewRev(doc /*: Metadata */) /*: Promise<void> */ {
    log.info({ path: doc.path }, 'Assigning new rev...')
    const { _rev } = await this.remoteCozy.client.files.statById(doc.remote._id)
    doc.remote._rev = _rev
  }

  diskUsage() /*: Promise<*> */ {
    return this.remoteCozy.diskUsage()
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

module.exports = {
  Remote,
  dirAndName
}
