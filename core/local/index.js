/** The Local side read/write interface.
 *
 * @module core/local
 * @flow
 */

const fs = require('fs').promises
const path = require('path')
const stream = require('stream')

const async = require('async')
const autoBind = require('auto-bind')
const bluebird = require('bluebird')
const fse = require('fs-extra')

const { TMP_DIR_NAME } = require('./constants')
const stater = require('./stater')
const metadata = require('../metadata')
const syncDir = require('./sync_dir')
const watcher = require('./watcher')
const { NOTE_MIME_TYPE } = require('../remote/constants')
const { isRetryableNetworkError } = require('../remote/errors')
const { hideOnWindows } = require('../utils/fs')
const { logger } = require('../utils/logger')
const { measureTime } = require('../utils/perfs')
const sentry = require('../utils/sentry')
const streamUtils = require('../utils/stream')

/*::
import type EventEmitter from 'events'
import type { SideName } from '../side'
import type { Config } from '../config'
import type { Reader } from '../reader'
import type { Ignore } from '../ignore'
import type { ChannelEventsDispatcher } from './channel_watcher/dispatch'
import type {
  DocType,
  Metadata,
  MetadataLocalInfo,
  SavedMetadata
} from '../metadata'
import type { Pouch } from '../pouch'
import type Prep from '../prep'
import type { Writer } from '../writer'
import type { Callback } from '../utils/func'
import type { Watcher } from './watcher'
import type { ProgressCallback, ReadableWithSize } from '../utils/stream'
*/

const log = logger({
  component: 'LocalWriter'
})

/*::
export type LocalOptions = {
  config: Config,
  onChannelEvents?: ChannelEventsDispatcher,
  prep: Prep,
  pouch: Pouch,
  events: EventEmitter,
  ignore: Ignore,
  sendToTrash: (string) => Promise<void>
}
*/

/** `Local` is the class that interfaces cozy-desktop with the local filesystem.
 *
 * It uses a watcher, based on chokidar, to listen for file and folder changes.
 * It also applied changes from the remote cozy on the local filesystem.
 *
 * Its `other` attribute is a reference to a {@link module:core/remote|Remote} side instance.
 * This allows us to read from the remote Cozy when writing to the local
 * filesystem.
 */
class Local /*:: implements Reader, Writer */ {
  /*::
  name: SideName
  prep: Prep
  pouch: Pouch
  events: EventEmitter
  syncPath: string
  syncDirCheckInterval: IntervalID
  tmpPath: string
  sendToTrash: (string) => Promise<void>
  watcher: Watcher
  other: Reader
  */

  constructor(opts /*: LocalOptions */) {
    this.name = 'local'
    this.prep = opts.prep
    this.pouch = opts.pouch
    this.events = opts.events
    this.syncPath = opts.config.syncPath
    this.tmpPath = path.join(this.syncPath, TMP_DIR_NAME)
    this.sendToTrash = opts.sendToTrash
    this.watcher = watcher.build(opts)
    // $FlowFixMe
    this.other = null

    autoBind(this)
    bluebird.promisifyAll(this)
  }

  /*::
  addFileAsync: (SavedMetadata, ?ProgressCallback) => Promise<*>
  addFolderAsync: (SavedMetadata) => Promise<*>
  renameConflictingDocAsync: (doc: SavedMetadata, newPath: string) => Promise<void>
  */

  /** Start initial replication + watching changes in live */
  start() {
    syncDir.ensureExistsSync(this)
    this.syncDirCheckInterval = syncDir.startIntervalCheck(this)
    return this.watcher.start()
  }

  resume() {
    syncDir.ensureExistsSync(this)
    this.syncDirCheckInterval = syncDir.startIntervalCheck(this)
    return this.watcher.resume()
  }

  suspend() {
    clearInterval(this.syncDirCheckInterval)
    return this.watcher.suspend()
  }

  /** Stop watching the file system */
  stop() {
    clearInterval(this.syncDirCheckInterval)
    return this.watcher.stop()
  }

  /** Create a readable stream for the given doc */
  async createReadStreamAsync(
    doc /*: SavedMetadata */
  ) /*: Promise<ReadableWithSize> */ {
    const filePath = this.abspath(doc.path)
    return new Promise((resolve, reject) => {
      const contentStream = fse.createReadStream(filePath)
      contentStream.on('error', reject)
      contentStream.on('open', () => {
        // Once the promise is resolved, it can't be rejected so we should not
        // expect later stream errors to reject it and can thus remove the
        // listener.
        contentStream.off('error', reject)

        resolve(streamUtils.withSize(contentStream, doc.size || 0))
      })
    })
  }

  abspath(fpath /*: string */) /*: string */ {
    return path.resolve(this.syncPath, fpath)
  }

  /* Helpers */

  /**
   * Update last modification date and do a chmod +x if the file is executable.
   *
   * Note: UNIX has 3 timestamps for a file/folder:
   * - atime for last access
   * - ctime for change (metadata or content)
   * - utime for update (content only)
   * This function updates utime and ctime according to the last modification
   * date.
   */
  async updateMetadataAsync /*::<T: SavedMetadata|Metadata> */(
    doc /*: T */
  ) /*: Promise<void> */ {
    let filePath = this.abspath(doc.path)

    if (doc.docType === metadata.FILE) {
      // TODO: Honor existing read/write permissions
      await fse.chmod(filePath, doc.executable ? 0o755 : 0o644)
    }

    if (doc.updated_at) {
      let updated = new Date(doc.updated_at)
      try {
        await fse.utimes(filePath, updated, updated)
      } catch (_) {
        // Ignore errors
      }
    }
  }

  inodeSetter(doc /*: SavedMetadata */) {
    let abspath = this.abspath(doc.path)
    return (callback /*: Callback */) => {
      stater.withStats(abspath, (err, stats) => {
        if (err) {
          callback(err)
        } else {
          stater.assignInoAndFileId(doc, stats)
          callback(null)
        }
      })
    }
  }

  /** Check if a file corresponding to given checksum already exists */
  async fileExistsLocally(checksum /*: string */) {
    const docs /*: SavedMetadata[] */ = await this.pouch.byChecksum(checksum)
    if (docs == null || docs.length === 0) {
      return false
    }

    for (const doc of docs) {
      if (metadata.isUpToDate('local', doc)) {
        const filePath = this.abspath(doc.path)
        if (await fse.exists(filePath)) return filePath
      }
    }
    return false
  }

  async exists(relpath /*: string */) /*: Promise<boolean> */ {
    return fse.exists(this.abspath(relpath))
  }

  /* Write operations */

  /**
   * Add a new file, or replace an existing one
   *
   * Steps to create a file:
   *   * Try to find a similar file based on his checksum
   *     (in that case, it just requires a local copy)
   *   * Or download the linked binary from remote
   *   * Write to a temporary file
   *   * Ensure parent folder exists
   *   * Move the temporay file to its final destination
   *   * Update creation and last modification dates
   *
   * Note: if no checksum was available for this file, we download the file
   * from the remote document. Later, chokidar will fire an event for this new
   * file. The checksum will then be computed and added to the document, and
   * then pushed to CouchDB.
   */
  addFile(
    doc /*: SavedMetadata */,
    onProgress /*: ?ProgressCallback */,
    callback /*: Callback */
  ) /*: void */ {
    if (callback == null) {
      callback = (onProgress /*: any */)
      onProgress = undefined
    }

    let tmpFile = path.resolve(this.tmpPath, `${path.basename(doc.path)}.tmp`)
    let filePath = this.abspath(doc.path)
    let parent = this.abspath(path.dirname(doc.path))
    const stopMeasure = measureTime('LocalWriter#addFile')

    log.info('Put file', { path: doc.path })

    async.waterfall(
      [
        async () => {
          if (doc.md5sum != null) {
            return this.fileExistsLocally(doc.md5sum)
          } else {
            return false
          }
        },

        async.retryable(
          { times: 5, interval: 2000, errorFilter: isRetryableNetworkError },
          async existingFilePath => {
            return new Promise((resolve, reject) => {
              fse.ensureDir(this.tmpPath, async () => {
                hideOnWindows(this.tmpPath)
                if (existingFilePath) {
                  log.info(`Recopy ${existingFilePath} -> ${filePath}`, {
                    path: filePath
                  })
                  this.events.emit('transfer-copy', doc)
                  fse.copy(existingFilePath, tmpFile, err => {
                    if (err) {
                      reject(err)
                    } else {
                      resolve()
                    }
                  })
                } else {
                  try {
                    const reader = await this.other.createReadStreamAsync(doc)
                    const source = onProgress
                      ? streamUtils.withProgress(reader, onProgress)
                      : reader

                    const destination = fse.createWriteStream(tmpFile)

                    stream.pipeline(source, destination, err => {
                      if (err) {
                        reject(err)
                      } else {
                        resolve()
                      }
                    })
                  } catch (err) {
                    reject(err)
                  }
                }
              })
            })
          }
        ),

        async () => {
          if (doc.md5sum != null) {
            const md5sum = await this.watcher.checksumer.push(tmpFile)

            if (md5sum !== doc.md5sum) {
              throw new Error('Invalid checksum')
            }
          }
        },

        async () => {
          // After downloading a file, check that the size is correct too
          // (more protection against stack corruption)
          return new Promise((resolve, reject) => {
            stater.withStats(tmpFile, (err, stats) => {
              if (err) {
                reject(err)
              } else if (!doc.size || doc.size === stats.size) {
                stater.assignInoAndFileId(doc, stats)
                resolve()
              } else {
                reject(sentry.flag(new Error('Invalid size')))
              }
            })
          })
        },

        async () => {
          return new Promise((resolve, reject) => {
            fse.ensureDir(parent, () => {
              fse.rename(tmpFile, filePath, err => {
                if (
                  err != null &&
                  err.code === 'EPERM' &&
                  doc.mime === NOTE_MIME_TYPE
                ) {
                  // Old Cozy Note with read-only permissions.
                  // We need to remove the old version before we can write the
                  // new one.
                  fse.move(tmpFile, filePath, { overwrite: true }, err => {
                    if (err) {
                      reject(err)
                    } else {
                      resolve()
                    }
                  })
                } else if (err) {
                  reject(err)
                } else {
                  resolve()
                }
              })
            })
          })
        },

        async () => {
          await this.updateMetadataAsync(doc)
        },

        async () => {
          metadata.updateLocal(doc)
        }
      ],
      function(err) {
        stopMeasure()
        if (err) {
          log.warn('addFile failed', { path: doc.path, err, doc })
        }
        fse.unlink(tmpFile, () => callback(err))
      }
    )
  }

  /** Create a new folder */
  addFolder(doc /*: SavedMetadata */, callback /*: Callback */) /*: void */ {
    let folderPath = path.join(this.syncPath, doc.path)
    log.info('Put folder', { path: doc.path })
    async.series(
      [
        cb => fse.ensureDir(folderPath, cb),
        this.inodeSetter(doc),
        async () => this.updateMetadataAsync(doc),
        cb => {
          metadata.updateLocal(doc)
          cb()
        }
      ],
      callback
    )
  }

  /** Overwrite a file */
  async overwriteFileAsync(
    doc /*: SavedMetadata */,
    onProgress /*: ?ProgressCallback */
  ) /*: Promise<void> */ {
    await this.addFileAsync(doc, onProgress)
  }

  /** Update the metadata of a file */
  async updateFileMetadataAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    log.info('Updating file metadata...', { path: doc.path })
    await this.updateMetadataAsync(doc)
    metadata.updateLocal(doc)
  }

  /** Update a folder */
  async updateFolderAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    await this.addFolderAsync(doc)
  }

  async assignNewRemote(doc /*: SavedMetadata */) /*: Promise<void> */ {
    log.info('Local assignNewRemote = updateLocal', { path: doc.path })
    metadata.updateLocal(doc)
  }

  /** Move a file or folder. In case of a file, content is unchanged.
   *
   * On GNU/Linux, it should be possible to prevent overwriting the destination
   * using the `RENAME_NOREPLACE` flag:
   * http://man7.org/linux/man-pages/man2/rename.2.html
   *
   * But since Node's `fs.rename()` doesn't expose any option, the current
   * implementation uses a separate `fs.stat()` step, which means it doesn't
   * prevent race conditions:
   * https://nodejs.org/dist/latest-v8.x/docs/api/fs.html#fs_fs_rename_oldpath_newpath_callback
   * https://nodejs.org/dist/latest-v8.x/docs/api/fs.html#fs_fs_stat_path_callback
   *
   * TODO: atomic local destination check + move
   */
  async moveAsync /*::<T: Metadata|SavedMetadata> */(
    doc /*: T */,
    old /*: T */
  ) /*: Promise<void> */ {
    log.info(
      `Moving ${old.docType}${doc.overwrite ? ' (with overwrite)' : ''}`,
      { path: doc.path, oldpath: old.path }
    )

    if (
      doc.overwrite &&
      metadata.id(doc.overwrite.path) !== metadata.id(old.path)
    ) {
      await this.trashAsync(doc.overwrite)
    }

    let oldPath = path.join(this.syncPath, old.path)
    let newPath = path.join(this.syncPath, doc.path)

    if (metadata.id(doc.path) !== metadata.id(old.path)) {
      try {
        const stats = await fse.stat(newPath)
        const err = new Error(`Move destination already exists: ${newPath}`)
        // Assign stats to the Error so we can inspect them in logs
        // $FlowFixMe
        err.stats = stats
        throw err
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }

    await fs.rename(oldPath, newPath)
    await this.updateMetadataAsync(doc)
    metadata.updateLocal(doc)
  }

  async trashAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    log.info('Moving to the OS trash...', { path: doc.path })
    const fullpath = path.join(this.syncPath, doc.path)
    try {
      await this.sendToTrash(fullpath)
    } catch (err) {
      if (err.code === 'ENOENT') {
        log.warn(`Cannot trash locally deleted ${doc.docType}.`, {
          path: doc.path
        })
        return
      }

      log.error('Could not trash local document', {
        path: doc.path,
        err,
        sentry: true
      })
    }

    log.info('Permanently deleting...', { path: doc.path })
    try {
      await fse.remove(fullpath)
    } catch (err) {
      log.error('Could not permanently delete document', {
        path: fullpath,
        err,
        sentry: true
      })
      throw err
    }
  }

  // Resolve the conflict created by the changes stored in `newMetadata` by
  // renaming its local version with a conflict suffix so `newMetadata` can be
  // saved separately in PouchDB.
  async resolveConflict /*::<T: Metadata|SavedMetadata> */(
    newMetadata /*: T & { local: MetadataLocalInfo } */
  ) /*: Promise<T> */ {
    const conflict = metadata.createConflictingDoc(newMetadata)

    log.info('Resolving local conflict', {
      path: conflict.path,
      oldpath: newMetadata.path
    })
    await this.moveAsync(conflict, newMetadata)

    return conflict
  }
}

module.exports = {
  Local
}
