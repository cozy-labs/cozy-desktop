/* @flow */

import Promise from 'bluebird'
import chokidar from 'chokidar'
import find from 'lodash.find'
import fs from 'fs'
import mime from 'mime'
import path from 'path'

import * as checksumer from './checksumer'
import * as chokidarEvent from './chokidar_event'
import LocalEventBuffer from './event_buffer'
import logger from '../logger'
import * as metadata from '../metadata'
import Pouch from '../pouch'
import Prep from '../prep'
import { PendingMap } from '../utils/pending'
import { maxDate } from '../timestamp'

import type { Checksumer } from './checksumer'
import type { ChokidarFSEvent } from './chokidar_event'
import type { Metadata } from '../metadata'
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
  initialScan: ?{ids: string[]}
  pendingDeletions: PendingMap
  checksumer: Checksumer
  watcher: any // chokidar
  buffer: LocalEventBuffer<ChokidarFSEvent>

  constructor (syncPath: string, prep: Prep, pouch: Pouch) {
    this.syncPath = syncPath
    this.prep = prep
    this.pouch = pouch
    const timeoutInMs = 1000 // TODO: Read from config
    this.buffer = new LocalEventBuffer(timeoutInMs, this.handleEvents)
    this.checksumer = checksumer.init()
  }

  // Start chokidar, the filesystem watcher
  // https://github.com/paulmillr/chokidar
  start () {
    log.debug('Starting...')

    // To detect which files&folders have been removed since the last run of
    // cozy-desktop, we keep all the paths seen by chokidar during its
    // initial scan in @paths to compare them with pouchdb database.
    this.initialScan = {ids: []}

    // A map of pending operations. It's used for detecting move operations,
    // as chokidar only reports adds and deletion. The key is the path (as
    // seen on the filesystem, not normalized as an _id), and the value is
    // an object, with at least a done method and a timeout value. The done
    // method can be used to finalized the pending operation (we are sure we
    // want to save the operation as it in pouchdb), and the timeout can be
    // cleared to cancel the operation (for example, a deletion is finally
    // seen as a part of a move operation).
    this.pendingDeletions = new PendingMap()

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
      for (let eventType of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
        this.watcher.on(eventType, (path?: string, stats?: fs.Stats) => {
          log.chokidar.debug({path}, eventType)
          log.chokidar.trace({stats})
          const newEvent = chokidarEvent.build(eventType, path, stats)
          this.buffer.push(newEvent)
        })
      }

      this.watcher
        .on('ready', this.onReady(resolve))
        .on('error', (err) => {
          if (err.message === 'watch ENOSPC') {
            log.error('Sorry, the kernel is out of inotify watches! ' +
              'See doc/usage/inotify.md for how to solve this issue.')
          } else {
            log.error({err})
          }
        })

      log.info(`Now watching ${this.syncPath}`)
    })
  }

  async handleEvents (events: ChokidarFSEvent[]) {
    log.debug(`Flushed ${events.length} events`)
    const pendingDeletions = []
    for (let e of events) {
      try {
        if (e.type.startsWith('unlink')) {
          pendingDeletions.push(e)
        }
        switch (e.type) {
          case 'add':
            {
              if (this.initialScan) { this.initialScan.ids.push(metadata.id(e.path)) }
              const unlinkEvent = find(pendingDeletions, e2 => e2.path === e.path)
              if (unlinkEvent != null) {
                if (e.type.endsWith('Dir')) {
                  await this.onUnlinkDir(e.path)
                } else {
                  await this.onUnlinkFile(e.path)
                }
              }
              const md5sum = await this.checksum(e.path)
              // Let's see if one of the pending deleted files has the
              // same checksum that the added file. If so, we mark them as
              // a move.
              let docs = [] // TODO: rename
              try {
                docs = await this.pouch.byChecksumAsync(md5sum)
              } catch (err) {
                log.trace({err}, `no doc with checksum ${md5sum}`)
              }
              await this.onAddFile(e.path, e.stats, md5sum, docs, pendingDeletions)
              break
            }
          case 'addDir':
            await this.onAddDir(e.path, e.stats)
            break
          case 'change':
            {
              const md5sum = await this.checksum(e.path)
              await this.onChange(e.path, e.stats, md5sum)
              break
            }
          case 'unlink':
            await this.onUnlinkFile(e.path)
            break
          case 'unlinkDir':
            await this.onUnlinkDir(e.path)
            break
          default:
            throw new TypeError(`Unknown event type: ${e.type}`)
        }
      } catch (err) {
        log.error({err, path: e.path})
        throw err
      }
    }
  }

  stop () {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.buffer.switchMode('idle')
    this.pendingDeletions.executeAll()
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
  createDoc (filePath: string, stats: fs.Stats, md5sum: string) {
    const mimeType = mime.lookup(filePath)
    const {mtime, ctime} = stats
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
    return doc
  }

  async checksum (filePath: string): Promise<string> {
    const absPath = path.join(this.syncPath, filePath)
    return this.checksumer.push(absPath)
  }

  /* Actions */

  // New file detected
  onAddFile (filePath: string, stats: fs.Stats, md5sum: string, docs: Metadata[], pendingDeletions: ChokidarFSEvent[]) {
    const logError = (err) => log.error({err, path: filePath})
    const doc = this.createDoc(filePath, stats, md5sum)
    if (pendingDeletions.length === 0) {
      log.info({path: filePath}, 'file added')
      this.prep.addFileAsync(SIDE, doc).catch(logError)
    } else {
      if (docs.length === 0) {
        this.prep.addFileAsync(SIDE, doc).catch(logError)
      } else {
        const same: ?Metadata = find(docs, this.initialScan
            ? d => !fs.existsSync(d.path)
            : d => find(pendingDeletions, e => e.path === d.path))
        if (same) {
          log.info({path: filePath}, `was moved from ${same.path}`)
          // TODO: pendingDeletions.splice(pendingDeletions.indexOf(same), 1)
          this.prep.moveFileAsync(SIDE, doc, same).catch(logError)
        } else {
          log.info({path: filePath}, 'file added')
          this.prep.addFileAsync(SIDE, doc).catch(logError)
        }
      }
    }
  }

  // New directory detected
  onAddDir (folderPath: string, stats: fs.Stats) {
    if (folderPath === '') return

    if (this.initialScan) { this.initialScan.ids.push(metadata.id(folderPath)) }
    this.pendingDeletions.executeIfAny(folderPath)
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
      this.pendingDeletions.executeIfAny(filePath)
    }
    this.pendingDeletions.add(filePath, {stopChecking, execute})
    timeout = setTimeout(check, 1250)
  }

  // Folder deletion detected
  //
  // We don't want to delete a folder before files inside it. So we wait a bit
  // after chokidar event to declare the folder as deleted.
  onUnlinkDir (folderPath: string) {
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
      if (!this.pendingDeletions.hasPendingChild(folderPath)) {
        this.pendingDeletions.executeIfAny(folderPath)
      }
    }
    this.pendingDeletions.add(folderPath, {stopChecking, execute})
    interval = setInterval(check, 350)
  }

  // File update detected
  onChange (filePath: string, stats: fs.Stats, md5sum: string) {
    log.info({path: filePath}, 'File changed')
    const doc = this.createDoc(filePath, stats, md5sum)
    return this.prep.updateFileAsync(SIDE, doc)
  }

  // Called after chokidar has finished its initial scan
  onReady (callback: Callback) {
    return () => {
      this.buffer.switchMode('timeout')

      // Try to detect removed files & folders
      this.pouch.byRecursivePath('', async function (err, docs) {
        if (err) { return callback(err) }
        try {
          for (const doc of docs.reverse()) {
            // $FlowFixMe: initialScan cannot be null
            if (this.initialScan.ids.indexOf(metadata.id(doc.path)) !== -1 || doc.trashed) {
              continue
            } else if (doc.docType === 'file') {
              this.onUnlinkFile(doc.path)
            } else {
              this.onUnlinkDir(doc.path)
            }
          }
          delete this.initialScan
          setTimeout(callback, 3000)
        } catch (err) {
          callback(err)
        }
      }.bind(this))
    }
  }
}

export default LocalWatcher
