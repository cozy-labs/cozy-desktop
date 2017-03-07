/* @flow weak */

import async from 'async'
import chokidar from 'chokidar'
import crypto from 'crypto'
import find from 'lodash.find'
import fs from 'fs'
import path from 'path'

import logger from '../logger'
import Pouch from '../pouch'
import Prep from '../prep'
import { PendingMap } from '../utils/pending'

import type { Pending } from '../utils/pending' // eslint-disable-line

const log = logger({
  prefix: 'Local watcher ',
  date: true
})
// This file contains the filesystem watcher that will trigger operations when
// a file or a folder is added/removed/changed locally.
// Operations will be added to the a common operation queue along with the
// remote operations triggered by the remoteEventWatcher.
let EXECUTABLE_MASK
class LocalWatcher {
  syncPath: string
  prep: Prep
  pouch: Pouch
  side: string
  paths: string[]
  pending: PendingMap
  checksums: number
  checksumer: any // async.queue
  watcher: any // chokidar

  static initClass () {
    EXECUTABLE_MASK = 1 << 6
  }

  constructor (syncPath, prep, pouch) {
    this.syncPath = syncPath
    this.prep = prep
    this.pouch = pouch
    this.side = 'local'

    // Use a queue for checksums to avoid computing many checksums at the
    // same time. It's better for performance (hard disk are faster with
    // linear readings).
    this.checksumer = async.queue(this.computeChecksum)
  }

  // Start chokidar, the filesystem watcher
  // https://github.com/paulmillr/chokidar
  start () {
    log.info('Start watching filesystem for changes')

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
      // Ignore our own .cozy-desktop directory
      ignored: /[\/\\]\.cozy-desktop/, // eslint-disable-line no-useless-escape
      // Don't follow symlinks
      followSymlinks: false,
      // The stats object is used in methods below
      alwaysStat: true,
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
            log.error('Sorry, the kernel is out of inotify watches!')
            log.error('See doc/inotify.md for how to solve this issue.')
          } else {
            log.error(err)
          }
        })
    })
  }

  stop () {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.pending.doneAll()
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
  createDoc (filePath, stats, callback) {
    const absPath = path.join(this.syncPath, filePath)
    this.checksum(absPath, function (err, checksum) {
      let doc: Object = {
        path: filePath,
        docType: 'file',
        checksum,
        creationDate: stats.birthtime || stats.ctime,
        lastModification: stats.mtime,
        size: stats.size
      }
      if ((stats.mode & EXECUTABLE_MASK) !== 0) { doc.executable = true }
      callback(err, doc)
    })
  }

  // Put a checksum computation in the queue
  checksum (filePath, callback) {
    this.checksumer.push({filePath}, callback)
  }

  // Get checksum for given file
  computeChecksum (task, callback) {
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
  onAddFile (filePath, stats) {
    log.info(`${filePath}: File added`)
    if (this.paths) { this.paths.push(filePath) }
    this.pending.doneIfAny(filePath)
    this.checksums++
    this.createDoc(filePath, stats, (err, doc) => {
      if (err) {
        this.checksums--
        log.info(err)
      } else {
        if (this.pending.isEmpty()) {
          this.checksums--
          this.prep.addFile(this.side, doc, this.done)
        } else {
          // Let's see if one of the pending deleted files has the
          // same checksum that the added file. If so, we mark them as
          // a move.
          this.pouch.byChecksum(doc.checksum, (err, docs) => {
            this.checksums--
            if (err) {
              this.prep.addFile(this.side, doc, this.done)
            } else {
              const same = find(docs, d => this.pending.hasPath(d.path))
              if (same) {
                log.info(`${filePath}: was moved from ${same.path}`)
                this.pending.clear(same.path)
                this.prep.moveFile(this.side, doc, same, this.done)
              } else {
                this.prep.addFile(this.side, doc, this.done)
              }
            }
          })
        }
      }
    })
  }

  // New directory detected
  onAddDir (folderPath, stats) {
    if (folderPath === '') return

    log.info(`${folderPath}: Folder added`)
    if (this.paths) { this.paths.push(folderPath) }
    this.pending.doneIfAny(folderPath)
    const doc = {
      path: folderPath,
      docType: 'folder',
      creationDate: stats.ctime,
      lastModification: stats.mtime
    }
    this.prep.putFolder(this.side, doc, this.done)
  }

  // File deletion detected
  //
  // It can be a file moved out. So, we wait a bit to see if a file with the
  // same checksum is added and, if not, we declare this file as deleted.
  onUnlinkFile (filePath) {
    let timeout
    const clear = () => {
      clearTimeout(timeout)
    }
    const done = () => {
      this.pending.clear(filePath)
      log.info(`${filePath}: File deleted`)
      this.prep.deleteFile(this.side, {path: filePath}, this.done)
    }
    const check = () => {
      if (this.checksums === 0) {
        done()
      } else {
        timeout = setTimeout(check, 100)
      }
    }
    this.pending.add(filePath, {clear, done, check})
    timeout = setTimeout(check, 1250)
  }

  // Folder deletion detected
  //
  // We don't want to delete a folder before files inside it. So we wait a bit
  // after chokidar event to declare the folder as deleted.
  onUnlinkDir (folderPath) {
    let interval
    const clear = () => {
      clearInterval(interval)
    }
    const done = () => {
      this.pending.clear(folderPath)
      log.info(`${folderPath}: Folder deleted`)
      this.prep.deleteFolder(this.side, {path: folderPath}, this.done)
    }
    const check = () => {
      if (!this.pending.hasPendingChild(folderPath)) { done() }
    }
    this.pending.add(folderPath, {clear, done, check})
    interval = setInterval(check, 350)
  }

  // File update detected
  onChange (filePath, stats) {
    log.info(`${filePath}: File updated`)
    this.createDoc(filePath, stats, (err, doc) => {
      if (err) {
        log.info(err)
      } else {
        this.prep.updateFile(this.side, doc, this.done)
      }
    })
  }

  // Try to detect removed files&folders
  // after chokidar has finished its initial scan
  onReady (callback) {
    return () => {
      this.pouch.byRecursivePath('', (err, docs) => {
        if (err) {
          callback(err)
        } else {
          async.eachSeries(docs.reverse(), (doc, next) => {
            if (this.paths.indexOf(doc.path) !== -1) {
              async.setImmediate(next)
            } else {
              this.prep.deleteDoc(this.side, doc, next)
            }
          }, err => {
            // $FlowFixMe
            this.paths = null
            callback(err)
          })
        }
      })
    }
  }

  // A callback that logs errors
  done (err) {
    if (err) { log.error(err) }
  }
}
LocalWatcher.initClass()

export default LocalWatcher
