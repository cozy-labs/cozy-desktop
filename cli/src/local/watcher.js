/* @flow */

import async from 'async'
import chokidar from 'chokidar'
import crypto from 'crypto'
import find from 'lodash.find'
import fs from 'fs'
import mime from 'mime'
import path from 'path'

import logger from '../logger'
import Pouch from '../pouch'
import Prep from '../prep'
import { PendingMap } from '../utils/pending'
import { maxDate } from '../timestamp'

import type { Callback } from '../utils/func'
import type { Pending } from '../utils/pending' // eslint-disable-line

const log = logger({
  component: 'LocalWatcher'
})
log.chokidar = log.child({
  component: 'Chokidar'
})

const EXECUTABLE_MASK = 1 << 6

const SIDE = 'local'

// This file contains the filesystem watcher that will trigger operations when
// a file or a folder is added/removed/changed locally.
// Operations will be added to the a common operation queue along with the
// remote operations triggered by the remoteEventWatcher.
class LocalWatcher {
  syncPath: string
  prep: Prep
  pouch: Pouch
  paths: string[]
  pending: PendingMap
  checksums: number
  checksumer: any // async.queue
  watcher: any // chokidar

  constructor (syncPath: string, prep: Prep, pouch: Pouch) {
    this.syncPath = syncPath
    this.prep = prep
    this.pouch = pouch

    // Use a queue for checksums to avoid computing many checksums at the
    // same time. It's better for performance (hard disk are faster with
    // linear readings).
    this.checksumer = async.queue(this.computeChecksum)
  }

  // Start chokidar, the filesystem watcher
  // https://github.com/paulmillr/chokidar
  start () {
    log.debug('Starting...')

    // To detect which files&folders have been removed since the last run of
    // cozy-desktop, we keep all the paths seen by chokidar during its
    // initial scan in @paths to compare them with pouchdb database.
    this.paths = []

    // A map of pending operations. It's used for detecting move operations,
    // as chokidar only reports adds and deletion. The key is the path (as
    // seen on the filesystem, not normalized as an _id), and the value is
    // an object, with at least a done method and a timeout value. The done
    // method can be used to finalized the pending operation (we are sure we
    // want to save the operation as it in pouchdb), and the timeout can be
    // cleared to cancel the operation (for example, a deletion is finally
    // seen as a part of a move operation).
    this.pending = new PendingMap()

    // A counter of how many files are been read to compute a checksum right
    // now. It's useful because we can't do some operations when a checksum
    // is running, like deleting a file, because the checksum operation is
    // slow but needed to detect move operations.
    this.checksums = 0

    this.watcher = chokidar.watch('.', {
      // Let paths in events be relative to this base path
      cwd: this.syncPath,
      // Ignore our own .system-tmp-cozy-drive directory
      ignored: /(^|[\/\\])\.system-tmp-cozy-drive/, // eslint-disable-line no-useless-escape
      // Don't follow symlinks
      followSymlinks: false,
      // The stats object is used in methods below
      alwaysStat: true,
      // Watching on Windows seems to lock dirs with subdirs, preventing them
      // from being renamed/moved/deleted.
      usePolling: (process.platform === 'win32'),
      // Filter out artifacts from editors with atomic writes
      atomic: true,
      // Poll newly created files to detect when the write is finished
      awaitWriteFinish: {
        pollInterval: 200,
        stabilityThreshold: 1000
      },
      // With node 0.10 on linux, only polling is available
      interval: 1000,
      binaryInterval: 2000
    })

    return new Promise((resolve) => {
      this.watcher
        .on('add', this.onAddFile)
        .on('addDir', this.onAddDir)
        .on('change', this.onChange)
        .on('unlink', this.onUnlinkFile)
        .on('unlinkDir', this.onUnlinkDir)
        .on('ready', this.onReady(resolve))
        .on('error', function (err) {
          if (err.message === 'watch ENOSPC') {
            log.error('Sorry, the kernel is out of inotify watches! ' +
              'See doc/inotify.md for how to solve this issue.')
          } else {
            log.error({err})
          }
        })

      log.info(`Now watching ${this.syncPath}`)
    })
  }

  stop () {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.pending.executeAll()
    // Give some time for awaitWriteFinish events to be fired
    return new Promise((resolve) => {
      setTimeout(resolve, 3000)
    })
  }

  // Show watched paths
  debug () {
    if (this.watcher) {
      log.info('This is the list of the paths watched by chokidar:')
      const object = this.watcher.getWatched()
      for (let dir in object) {
        var file
        const files = object[dir]
        if (dir === '..') {
          for (file of Array.from(files)) {
            log.info(`- ${dir}/${file}`)
          }
        } else {
          if (dir !== '.') { log.info(`- ${dir}`) }
          for (file of Array.from(files)) {
            log.info(`  * ${file}`)
          }
        }
      }
      log.info('--------------------------------------------------')
    } else {
      log.warn('The file system is not currrently watched')
    }
  }

  /* Helpers */

  // An helper to create a document for a file
  // with checksum and mime informations
  createDoc (filePath: string, stats: fs.Stats, callback: Callback) {
    const absPath = path.join(this.syncPath, filePath)
    const mimeType = mime.lookup(absPath)
    const {mtime, ctime} = stats
    this.checksum(absPath, function (err, md5sum) {
      let doc: Object = {
        path: filePath,
        docType: 'file',
        md5sum,
        updated_at: maxDate(mtime, ctime),
        mime: mimeType,
        class: mimeType.split('/')[0],
        size: stats.size
      }
      if ((stats.mode & EXECUTABLE_MASK) !== 0) { doc.executable = true }
      callback(err, doc)
    })
  }

  // Put a checksum computation in the queue
  checksum (filePath: string, callback: Callback) {
    this.checksumer.push({filePath}, callback)
  }

  // Get checksum for given file
  computeChecksum (task: {filePath: string}, callback: Callback) {
    const stream = fs.createReadStream(task.filePath)
    const checksum = crypto.createHash('md5')
    checksum.setEncoding('base64')
    stream.on('end', function () {
      checksum.end()
      callback(null, checksum.read())
    })
    stream.on('error', function (err) {
      checksum.end()
      callback(err)
    })
    stream.pipe(checksum)
  }

  /* Actions */

  // New file detected
  onAddFile (filePath: string, stats: fs.Stats) {
    const logError = (err) => log.error({err, path: filePath})
    log.chokidar.trace({event: 'add', path: filePath, stats})
    if (this.paths) { this.paths.push(filePath) }
    this.pending.executeIfAny(filePath)
    this.checksums++
    this.createDoc(filePath, stats, (err, doc) => {
      if (err) {
        this.checksums--
        logError(err)
      } else {
        if (this.pending.isEmpty()) {
          this.checksums--
          log.info({path: filePath}, 'file added')
          this.prep.addFileAsync(SIDE, doc).catch(logError)
        } else {
          // Let's see if one of the pending deleted files has the
          // same checksum that the added file. If so, we mark them as
          // a move.
          this.pouch.byChecksum(doc.md5sum, (err, docs) => {
            this.checksums--
            if (err) {
              log.info({path: filePath}, 'file added')
              this.prep.addFileAsync(SIDE, doc).catch(logError)
            } else {
              const same = find(docs, this.paths
                  ? d => !fs.existsSync(d.path)
                  : d => this.pending.hasPath(d.path))
              if (same) {
                log.info({path: filePath}, `was moved from ${same.path}`)
                this.pending.clear(same.path)
                this.prep.moveFileAsync(SIDE, doc, same).catch(logError)
              } else {
                log.info({path: filePath}, 'file added')
                this.prep.addFileAsync(SIDE, doc).catch(logError)
              }
            }
          })
        }
      }
    })
  }

  // New directory detected
  onAddDir (folderPath: string, stats: fs.Stats) {
    log.chokidar.trace({event: 'addDir', path: folderPath, stats})
    if (folderPath === '') return

    if (this.paths) { this.paths.push(folderPath) }
    this.pending.executeIfAny(folderPath)
    const doc = {
      path: folderPath,
      docType: 'folder',
      updated_at: stats.mtime
    }
    log.info({path: folderPath}, 'folder added')
    this.prep.putFolderAsync(SIDE, doc).catch(err => log.error({err, path: folderPath}))
  }

  // File deletion detected
  //
  // It can be a file moved out. So, we wait a bit to see if a file with the
  // same checksum is added and, if not, we declare this file as deleted.
  onUnlinkFile (filePath: string) {
    log.chokidar.trace({event: 'unlink', path: filePath})
    // TODO: Extract delayed execution logic to utils/pending
    let timeout
    const stopChecking = () => {
      clearTimeout(timeout)
    }
    const execute = () => {
      log.info({path: filePath}, 'File deleted')
      this.prep.trashFileAsync(SIDE, {path: filePath}).catch(err => log.error({err, path: filePath}))
    }
    const check = () => {
      if (this.checksums === 0) {
        this.pending.executeIfAny(filePath)
      } else {
        timeout = setTimeout(check, 100)
      }
    }
    this.pending.add(filePath, {stopChecking, execute})
    timeout = setTimeout(check, 1250)
  }

  // Folder deletion detected
  //
  // We don't want to delete a folder before files inside it. So we wait a bit
  // after chokidar event to declare the folder as deleted.
  onUnlinkDir (folderPath: string) {
    log.chokidar.trace({event: 'unlinkDir', path: folderPath})
    // TODO: Extract repeated check logic to utils/pending
    let interval
    const stopChecking = () => {
      clearInterval(interval)
    }
    const execute = () => {
      log.info({path: folderPath}, 'Folder deleted')
      this.prep.trashFolderAsync(SIDE, {path: folderPath}).catch(err => log.error({err, path: folderPath}))
    }
    const check = () => {
      if (!this.pending.hasPendingChild(folderPath)) {
        this.pending.executeIfAny(folderPath)
      }
    }
    this.pending.add(folderPath, {stopChecking, execute})
    interval = setInterval(check, 350)
  }

  // File update detected
  onChange (filePath: string, stats: fs.Stats) {
    log.chokidar.trace({event: 'change', path: filePath, stats})
    log.info({path: filePath}, 'File changed')
    this.createDoc(filePath, stats, (err, doc) => {
      if (err) {
        log.info({path: filePath, err})
      } else {
        this.prep.updateFileAsync(SIDE, doc).catch(err => log.error({err, path: filePath}))
      }
    })
  }

  // Try to detect removed files&folders
  // after chokidar has finished its initial scan
  onReady (callback: Callback) {
    return () => {
      this.pouch.byRecursivePath('', async function (err, docs) {
        if (err) { return callback(err) }
        try {
          for (const doc of docs.reverse()) {
            if (this.paths.indexOf(doc.path) !== -1 || doc.trashed) {
              continue
            } else if (doc.docType === 'file') {
              this.onUnlinkFile(doc.path)
            } else {
              this.onUnlinkDir(doc.path)
            }
          }
          delete this.paths
          setTimeout(callback, 3000)
        } catch (err) {
          callback(err)
        }
      }.bind(this))
    }
  }
}

export default LocalWatcher
