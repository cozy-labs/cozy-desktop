/** The Local side read/write interface.
 *
 * @module core/local
 * @flow
 */

const async = require('async')
const autoBind = require('auto-bind')
const fse = require('fs-extra')
const path = require('path')
const trash = require('trash')
const stream = require('stream')
const _ = require('lodash')
const diskUsage = require('diskusage')

const bluebird = require('bluebird')

const { TMP_DIR_NAME } = require('./constants')
const { NOTE_MIME_TYPE } = require('../remote/constants')
const stater = require('./stater')
const metadata = require('../metadata')
const { hideOnWindows } = require('../utils/fs')
const watcher = require('./watcher')
const syncDir = require('./sync_dir')
const logger = require('../utils/logger')
const measureTime = require('../utils/perfs')
const sentry = require('../utils/sentry')

/*::
import type EventEmitter from 'events'
import type { Config } from '../config'
import type { Reader } from '../reader'
import type { Ignore } from '../ignore'
import type { AtomEventsDispatcher } from './atom/dispatch'
import type { SavedMetadata } from '../metadata'
import type { Pouch } from '../pouch'
import type Prep from '../prep'
import type { Writer } from '../writer'
import type { Callback } from '../utils/func'
import type { Watcher } from './watcher'
*/

const log = logger({
  component: 'LocalWriter'
})

/*::
export type LocalOptions = {
  config: Config,
  onAtomEvents?: AtomEventsDispatcher,
  prep: Prep,
  pouch: Pouch,
  events: EventEmitter,
  ignore: Ignore
}
*/

const SYNC_DIR_EMPTY_MESSAGE = 'Syncdir is empty'
const SYNC_DIR_UNLINKED_MESSAGE = 'Syncdir has been unlinked'

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
  prep: Prep
  pouch: Pouch
  events: EventEmitter
  syncPath: string
  syncDirCheckInterval: IntervalID
  tmpPath: string
  watcher: Watcher
  other: Reader
  _trash: (Array<string>) => Promise<void>
  */

  constructor(opts /*: LocalOptions */) {
    this.prep = opts.prep
    this.pouch = opts.pouch
    this.events = opts.events
    this.syncPath = opts.config.syncPath
    this.tmpPath = path.join(this.syncPath, TMP_DIR_NAME)
    this.watcher = watcher.build(opts)
    // $FlowFixMe
    this.other = null
    this._trash = trash

    autoBind(this)
    bluebird.promisifyAll(this)
  }

  /*::
  addFileAsync: (SavedMetadata) => Promise<*>
  addFolderAsync: (SavedMetadata) => Promise<*>
  renameConflictingDocAsync: (doc: SavedMetadata, newPath: string) => Promise<void>
  */

  /** Start initial replication + watching changes in live */
  start() {
    syncDir.ensureExistsSync(this)
    this.syncDirCheckInterval = syncDir.startIntervalCheck(this)
    return this.watcher.start()
  }

  /** Stop watching the file system */
  stop() {
    clearInterval(this.syncDirCheckInterval)
    return this.watcher.stop()
  }

  /** Create a readable stream for the given doc */
  async createReadStreamAsync(
    doc /*: SavedMetadata */
  ) /*: Promise<stream.Readable> */ {
    const filePath = this.abspath(doc.path)
    return new Promise((resolve, reject) => {
      const contentStream = fse.createReadStream(filePath)
      contentStream.on('open', () => resolve(contentStream))
      contentStream.on('error', err => reject(err))
    })
  }

  abspath(fpath /*: string */) /*: string */ {
    return path.resolve(this.syncPath, fpath)
  }

  /* Helpers */

  /**
   * Return a function that will update last modification date
   * and does a chmod +x if the file is executable
   *
   * Note: UNIX has 3 timestamps for a file/folder:
   * - atime for last access
   * - ctime for change (metadata or content)
   * - utime for update (content only)
   * This function updates utime and ctime according to the last
   * modification date.
   */
  metadataUpdater(doc /*: SavedMetadata */) {
    return (callback /*: Callback */) => {
      this.updateMetadataAsync(doc)
        .then(() => {
          callback()
        })
        .catch(callback)
    }
  }

  async updateMetadataAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    let filePath = this.abspath(doc.path)

    if (doc.docType === 'file') {
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
  addFile(doc /*: SavedMetadata */, callback /*: Callback */) /*: void */ {
    let tmpFile = path.resolve(this.tmpPath, `${path.basename(doc.path)}.tmp`)
    let filePath = this.abspath(doc.path)
    let parent = this.abspath(path.dirname(doc.path))
    const stopMeasure = measureTime('LocalWriter#addFile')

    log.info({ path: doc.path }, 'Put file')

    async.waterfall(
      [
        async () => {
          if (doc.md5sum != null) {
            return this.fileExistsLocally(doc.md5sum)
          } else {
            return false
          }
        },

        (existingFilePath, next) => {
          fse.ensureDir(this.tmpPath, () => {
            hideOnWindows(this.tmpPath)
            if (existingFilePath) {
              log.info(
                { path: filePath },
                `Recopy ${existingFilePath} -> ${filePath}`
              )
              this.events.emit('transfer-copy', doc)
              fse.copy(existingFilePath, tmpFile, next)
            } else {
              this.other.createReadStreamAsync(doc).then(
                source => {
                  stream.pipeline(source, fse.createWriteStream(tmpFile), err =>
                    next(err)
                  )
                },
                err => {
                  next(err)
                }
              )
            }
          })
        },

        next => {
          if (doc.md5sum != null) {
            // TODO: Share checksumer instead of chaining properties
            this.watcher.checksumer
              .push(tmpFile)
              .asCallback(function(err, md5sum) {
                if (err) {
                  next(err)
                } else if (md5sum === doc.md5sum) {
                  next()
                } else {
                  next(new Error('Invalid checksum'))
                }
              })
          } else {
            next()
          }
        },

        next => {
          // After downloading a file, check that the size is correct too
          // (more protection against stack corruption)
          stater.withStats(tmpFile, (err, stats) => {
            if (err) {
              next(err)
            } else if (!doc.size || doc.size === stats.size) {
              stater.assignInoAndFileId(doc, stats)
              next()
            } else {
              next(sentry.flag(new Error('Invalid size')))
            }
          })
        },

        next =>
          fse.ensureDir(parent, () =>
            fse.rename(tmpFile, filePath, err => {
              if (
                err != null &&
                err.code === 'EPERM' &&
                doc.mime === NOTE_MIME_TYPE
              ) {
                // Old Cozy Note with read-only permissions.
                // We need to remove the old version before we can write the
                // new one.
                fse.move(tmpFile, filePath, { overwrite: true }, next)
              } else {
                next(err)
              }
            })
          ),

        this.metadataUpdater(doc),
        next => {
          metadata.updateLocal(doc)
          next()
        }
      ],
      function(err) {
        stopMeasure()
        if (err) {
          log.warn({ path: doc.path, err, doc }, 'addFile failed')
        }
        fse.unlink(tmpFile, () => callback(err))
      }
    )
  }

  /** Create a new folder */
  addFolder(doc /*: SavedMetadata */, callback /*: Callback */) /*: void */ {
    let folderPath = path.join(this.syncPath, doc.path)
    log.info({ path: doc.path }, 'Put folder')
    async.series(
      [
        cb => fse.ensureDir(folderPath, cb),
        this.inodeSetter(doc),
        this.metadataUpdater(doc),
        cb => {
          metadata.updateLocal(doc)
          cb()
        }
      ],
      callback
    )
  }

  /** Overwrite a file */
  async overwriteFileAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    await this.addFileAsync(doc)
  }

  /** Update the metadata of a file */
  async updateFileMetadataAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    log.info({ path: doc.path }, 'Updating file metadata...')
    await new Promise((resolve, reject) => {
      this.metadataUpdater(doc)(err => {
        if (err) reject(err)
        else resolve()
      })
    })
    metadata.updateLocal(doc)
  }

  /** Update a folder */
  async updateFolderAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    await this.addFolderAsync(doc)
  }

  async assignNewRemote(doc /*: SavedMetadata */) /*: Promise<void> */ {
    log.info({ path: doc.path }, 'Local assignNewRemote = updateLocal')
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
  async moveAsync(
    doc /*: SavedMetadata */,
    old /*: SavedMetadata */
  ) /*: Promise<void> */ {
    log.info(
      { path: doc.path, oldpath: old.path },
      `Moving ${old.docType}${doc.overwrite ? ' (with overwrite)' : ''}`
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

    await fse.rename(oldPath, newPath)
    await this.updateMetadataAsync(doc)
    metadata.updateLocal(doc)
  }

  async trashAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    log.info({ path: doc.path }, 'Moving to the OS trash...')
    const fullpath = path.join(this.syncPath, doc.path)
    try {
      await this._trash([fullpath])
    } catch (err) {
      if (err.code === 'ENOENT') {
        log.warn(
          { path: doc.path },
          `Cannot trash locally deleted ${doc.docType}.`
        )
        return
      }
      throw err
    }
  }

  async deleteFolderAsync(doc /*: SavedMetadata */) /*: Promise<void> */ {
    if (doc.docType !== 'folder')
      throw new Error(`Not folder metadata: ${doc.path}`)
    const fullpath = path.join(this.syncPath, doc.path)

    try {
      log.info({ path: doc.path }, 'Deleting empty folder...')
      await fse.rmdir(fullpath)
      return
    } catch (err) {
      if (err.code === 'ENOENT') {
        // On Windows, using rmdir on a file will result in an ENOENT error
        // instead of ENOTDIR.
        // See https://nodejs.org/api/fs.html#fs_fs_rmdir_path_options_callback
        if (process.platform !== 'win32') return
        try {
          if (!(await fse.stat(fullpath)).isFile()) return
        } catch (err) {
          // calling stat on an empty path will raise an ENOENT error
          if (err.code === 'ENOENT') return
        }
        throw err
      }
      if (err.code !== 'ENOTEMPTY') throw err
    }
    log.warn({ path: doc.path }, 'Folder is not empty!')
    await this.trashAsync(doc)
  }

  async createBackupCopyAsync(
    doc /*: SavedMetadata */
  ) /*: Promise<SavedMetadata> */ {
    const backupPath = `${doc.path}.bck`
    await fse.copy(
      path.join(this.syncPath, doc.path),
      path.join(this.syncPath, backupPath)
    )
    const copy = _.cloneDeep(doc)
    copy.path = backupPath
    return copy
  }

  async diskUsage() /*: Promise<{ available: number, total: number }> */ {
    try {
      return await diskUsage.check(this.syncPath)
    } catch (err) {
      log.error({ err }, 'Could not get local available disk space')
      return { available: 0, total: 0 }
    }
  }

  async canApplyChange(doc /*: SavedMetadata */) /*: Promise<boolean> */ {
    try {
      // Check if the source path of a move can be accessed
      if (doc.moveFrom) {
        const { moveFrom } = doc
        await fse.access(
          this.abspath(moveFrom.path),
          fse.constants.R_OK | fse.constants.W_OK
        )
        await fse.access(
          this.abspath(path.dirname(moveFrom.path)),
          fse.constants.R_OK | fse.constants.W_OK
        )
      }
      // Check if the temporary path can be accessed
      if (doc.docType === 'file') {
        await fse.access(this.tmpPath, fse.constants.R_OK | fse.constants.W_OK)
      }
      // Check if the parent path can be accessed
      await fse.access(
        this.abspath(path.dirname(doc.path)),
        fse.constants.R_OK | fse.constants.W_OK
      )
    } catch (err) {
      log.warn(
        { err, path: doc.path, oldPath: doc.moveFrom && doc.moveFrom.path },
        'Not allowed to apply change'
      )
      return false
    }

    try {
      // Check if an existing destination path can be accessed
      if (fse.exists(this.abspath(doc.path))) {
        await fse.access(
          this.abspath(doc.path),
          fse.constants.R_OK | fse.constants.W_OK
        )
      }
      return true
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File does not exist so we can write
        return true
      }
      log.warn(
        { err, path: doc.path, oldPath: doc.moveFrom && doc.moveFrom.path },
        'Not allowed to apply change'
      )
      return false
    }
  }
}

module.exports = {
  SYNC_DIR_EMPTY_MESSAGE,
  SYNC_DIR_UNLINKED_MESSAGE,
  Local
}
