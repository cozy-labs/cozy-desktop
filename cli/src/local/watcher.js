/* @flow */

import Promise from 'bluebird'
import chokidar from 'chokidar'
import _ from 'lodash'
import fs from 'fs-extra'
import mime from 'mime'
import path from 'path'

import * as checksumer from './checksumer'
import * as chokidarEvent from './chokidar_event'
import * as prepAction from './prep_action'
import LocalEventBuffer from './event_buffer'
import logger from '../logger'
import * as metadata from '../metadata'
import Pouch from '../pouch'
import Prep from '../prep'
import { PendingMap } from '../utils/pending'
import { maxDate } from '../timestamp'

import type { Checksumer } from './checksumer'
import type { ChokidarFSEvent, ContextualizedChokidarFSEvent } from './chokidar_event'
import type {
  PrepAction, PrepAddFile, PrepPutFolder,
  PrepDeleteFile, PrepDeleteFolder, PrepMoveFile, PrepMoveFolder
} from './prep_action'
import type { Metadata } from '../metadata'
import type { Pending } from '../utils/pending' // eslint-disable-line

const log = logger({
  component: 'LocalWatcher'
})
log.chokidar = log.child({
  component: 'Chokidar'
})

const EXECUTABLE_MASK = 1 << 6

const SIDE = 'local'

type InitialScan = {
  ids: string[],
  resolve: () => void
}

// This file contains the filesystem watcher that will trigger operations when
// a file or a folder is added/removed/changed locally.
// Operations will be added to the a common operation queue along with the
// remote operations triggered by the remoteEventWatcher.
class LocalWatcher {
  syncPath: string
  prep: Prep
  pouch: Pouch
  initialScan: ?InitialScan
  pendingDeletions: PendingMap
  checksumer: Checksumer
  watcher: any // chokidar
  buffer: LocalEventBuffer<ChokidarFSEvent>

  constructor (syncPath: string, prep: Prep, pouch: Pouch) {
    this.syncPath = syncPath
    this.prep = prep
    this.pouch = pouch
    const timeoutInMs = 1000 // TODO: Read from config
    this.buffer = new LocalEventBuffer(timeoutInMs, this.onFlush)
    this.checksumer = checksumer.init()
  }

  // Start chokidar, the filesystem watcher
  // https://github.com/paulmillr/chokidar
  start () {
    log.debug('Starting...')

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

      // To detect which files&folders have been removed since the last run of
      // cozy-desktop, we keep all the paths seen by chokidar during its
      // initial scan in @paths to compare them with pouchdb database.
      this.initialScan = {ids: [], resolve}

      this.watcher
        .on('ready', () => this.buffer.switchMode('timeout'))
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

  // TODO: Start checksuming as soon as an add/change event is buffered
  // TODO: Put flushed event batches in a queue
  async onFlush (events: ChokidarFSEvent[]) {
    log.debug(`Flushed ${events.length} events`)

    events = events.filter((e) => e.path !== '') // @TODO handle root dir events

    const initialScan = this.initialScan
    if (initialScan != null) {
      const ids = initialScan.ids
      events.filter((e) => e.type.startsWith('add'))
            .forEach((e) => ids.push(metadata.id(e.path)))

      await this.prependOfflineUnlinkEvents(events, initialScan)

      log.debug({initialEvents: events})
    }

    // to become prepareEvents
    const preparedEvents : ContextualizedChokidarFSEvent[] = await this.prepareEvents(events)

    // to become sortAndSquash
    const actions : PrepAction[] = this.sortAndSquash(preparedEvents)

    await this.sendToPrep(actions)
    if (initialScan != null) {
      initialScan.resolve()
      this.initialScan = null
    }
  }

  async prependOfflineUnlinkEvents (events: ChokidarFSEvent[], initialScan: InitialScan) {
    // Try to detect removed files & folders
    const docs = await this.pouch.byRecursivePathAsync('')
    for (const doc of docs) {
      if (initialScan.ids.indexOf(metadata.id(doc.path)) !== -1 || doc.trashed) {
        continue
      } else if (doc.docType === 'file') {
        events.unshift({type: 'unlink', path: doc.path})
      } else {
        events.unshift({type: 'unlinkDir', path: doc.path})
      }
    }
  }

  async prepareEvents (events: ChokidarFSEvent[]) : Promise<ContextualizedChokidarFSEvent[]> {
    return Promise
      .all(events.map(async (e: ChokidarFSEvent): Promise<?ContextualizedChokidarFSEvent> => {
        const abspath = path.join(this.syncPath, e.path)
        const oldMetadata = async (e: ChokidarFSEvent): Promise<?Metadata> => {
          switch (e.type) {
            case 'unlink':
            case 'unlinkDir':
              try {
                return await this.pouch.db.get(metadata.id(e.path))
              } catch (err) {
                if (err.status !== 404) log.error({err, event: e})
              }
          }
          return null
        }

        const e2: Object = {
          ...e,
          old: await oldMetadata(e)
        }

        if (e.type === 'add' || e.type === 'change') {
          try {
            e2.md5sum = await this.checksum(e.path)
          } catch (err) {
            if (err.code.match(/ENOENT/)) {
              log.debug(`Skipping file as it does not exist anymore: ${abspath}`)
            } else {
              log.warn({err}, `Could not compute checksum of file: ${abspath}`)
            }
            return null
          }
        }

        if (e.type === 'addDir') {
          if (!await fs.exists(abspath)) {
            log.debug(`Skipping dir as it does not exist anymore: ${abspath}`)
            return null
          }
        }

        if (e.type === 'add') {
          e2.sameChecksums = []
          try {
            e2.sameChecksums = await this.pouch.byChecksumAsync(e2.md5sum)
          } catch (err) {
            log.debug({err}, `no doc with checksum ${e2.md5sum}`)
          }
        }

        return e2
      }))
      .filter((e: ?ContextualizedChokidarFSEvent) => e != null)
  }

  sortAndSquash (events: ContextualizedChokidarFSEvent[]) : PrepAction[] {
    const actions: PrepAction[] = []

    // TODO: Split by type and move to appropriate modules?
    const getInode = (e: ContextualizedChokidarFSEvent): ?number => {
      switch (e.type) {
        case 'add':
        case 'addDir':
        case 'change':
          return e.stats.ino
        case 'unlink':
        case 'unlinkDir':
          if (e.old != null) return e.old.ino
      }
    }

    const panic = (context, description) => {
      log.error(context, description)
      throw new Error(description)
    }

    for (let e: ContextualizedChokidarFSEvent of events) {
      try {
        switch (e.type) {
          case 'add':
            {
              const moveAction: ?PrepMoveFile = prepAction.find(actions, prepAction.maybeMoveFile, a => a.ino === getInode(e))
              if (moveAction) {
                panic({moveAction, event: e},
                  'We should not have both move and add actions since ' +
                  'checksumless adds and inode-less unlink events are dropped')
              }

              const unlinkAction: ?PrepDeleteFile = prepAction.findAndRemove(actions, prepAction.maybeDeleteFile, a => a.ino === getInode(e))
              if (unlinkAction) {
                // New move found
                actions.push(prepAction.build('PrepMoveFile', e.path, {stats: e.stats, md5sum: e.md5sum, old: unlinkAction.old, ino: unlinkAction.ino}))
              } else {
                actions.push(prepAction.fromChokidar(e))
              }
            }
            break
          case 'addDir':
            {
              const moveAction: ?PrepMoveFolder = prepAction.find(actions, prepAction.maybeMoveFolder, a => a.ino === getInode(e))
              if (moveAction) {
                panic({moveAction, event: e},
                  'We should not have both move and addDir actions since ' +
                  'non-existing addDir and inode-less unlinkDir events are dropped')
              }

              const unlinkAction: ?PrepDeleteFolder = prepAction.findAndRemove(actions, prepAction.maybeDeleteFolder, a => a.ino === getInode(e))
              if (unlinkAction) {
                // New move found
                actions.push(prepAction.build('PrepMoveFolder', e.path, {stats: e.stats, old: unlinkAction.old, ino: unlinkAction.ino}))
              } else {
                actions.push(prepAction.fromChokidar(e))
              }
            }
            break
          case 'change':
            actions.push(prepAction.fromChokidar(e))
            break
          case 'unlink':
            {
              const moveAction: ?PrepMoveFile = prepAction.findAndRemove(actions, prepAction.maybeMoveFile, a => a.ino === getInode(e))
              if (moveAction) {
                panic({moveAction, event: e},
                  'We should not have both move and unlink actions since ' +
                  'checksumless adds and inode-less unlink events are dropped')
              }

              const addAction: ?PrepAddFile = prepAction.findAndRemove(actions, prepAction.maybeAddFile, a => a.ino === getInode(e))
              if (addAction) {
                // New move found
                actions.push(prepAction.build('PrepMoveFile', addAction.path, {
                  stats: addAction.stats,
                  md5sum: addAction.md5sum,
                  old: e.old,
                  ino: addAction.ino
                }))
              } else if (getInode(e)) {
                actions.push(prepAction.fromChokidar(e))
              } // else skip
            }
            break
          case 'unlinkDir':
            {
              const moveAction: ?PrepMoveFolder = prepAction.findAndRemove(actions, prepAction.maybeMoveFolder, a => a.ino === getInode(e))
              if (moveAction) {
                panic({moveAction, event: e},
                  'We should not have both move and unlinkDir actions since ' +
                  'non-existing addDir and inode-less unlinkDir events are dropped')
              }

              const addAction: ?PrepPutFolder = prepAction.findAndRemove(actions, prepAction.maybePutFolder, a => a.ino === getInode(e))
              if (addAction) {
                // New move found
                actions.push(prepAction.build('PrepMoveFolder', addAction.path, {
                  stats: addAction.stats,
                  old: e.old,
                  ino: addAction.ino
                }))
              } else if (getInode(e)) {
                actions.push(prepAction.fromChokidar(e))
              } // else skip
            }
            break
          default:
            throw new TypeError(`Unknown event type: ${e.type}`)
        }
      } catch (err) {
        log.error({err, path: e.path})
        throw err
      }
      if (process.env.DEBUG) console.log({actions, e})
    }

    for (let i = 0; i < actions.length; i++) {
      for (let j = 0; j < actions.length; j++) {
        if (i !== j && prepAction.isChildMove(actions[i], actions[j])) {
          actions.splice(j, 1)
          j--
        }
      }
    }

    // To check : Dossier supprimé après ces enfants
    // Détection de fichier

    const [deletions, sortedActions] = _.partition(actions, (x) => x.type.startsWith('PrepDelete'))
    const sortedDeletions = _.chain(deletions)
      .sortBy('path')
      .reverse()
      .value()

    return sortedActions.concat(sortedDeletions)
  }

  // @TODO inline this.onXXX in this function
  // @TODO rename PrepAction types to prep.xxxxxx
  async sendToPrep (actions: PrepAction[]) {
    const errors: Error[] = []
    // to become sendToPrep
    for (let a of actions) {
      try {
        switch (a.type) {
          // TODO: Inline old LocalWatcher methods
          case 'PrepDeleteFolder':
            await this.onUnlinkDir(a.path)
            break
          case 'PrepDeleteFile':
            await this.onUnlinkFile(a.path)
            break
          case 'PrepPutFolder':
            await this.onAddDir(a.path, a.stats)
            break
          case 'PrepUpdateFile':
            await this.onChange(a.path, a.stats, a.md5sum)
            break
          case 'PrepAddFile':
            await this.onAddFile(a.path, a.stats, a.md5sum)
            break
          case 'PrepMoveFile':
            await this.onMoveFile(a.path, a.stats, a.md5sum, a.old)
            break
          case 'PrepMoveFolder':
            await this.onMoveFolder(a.path, a.stats, a.old)
            break
          default:
            throw new Error('wrong actions')
        }
      } catch (err) {
        log.error({err})
        errors.push(err)
      }
    }

    if (errors.length > 0) {
      throw new Error(`Could not apply all actions to Prep:\n- ${errors.map(e => e.stack).join('\n- ')}`)
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
  // TODO: Rename to buildFileMetadata?
  createDoc (filePath: string, stats: fs.Stats, md5sum: string) {
    const mimeType = mime.lookup(filePath)
    const {mtime, ctime} = stats
    let doc: Object = {
      path: filePath,
      docType: 'file',
      md5sum,
      ino: stats.ino,
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

  buildDirMetadata (path: string, stats: fs.Stats) {
    return {
      path,
      docType: 'folder',
      updated_at: stats.mtime,
      ino: stats.ino
    }
  }

  /* Actions */

  // New file detected
  onAddFile (filePath: string, stats: fs.Stats, md5sum: string) {
    const logError = (err) => log.error({err, path: filePath})
    const doc = this.createDoc(filePath, stats, md5sum)
    log.info({path: filePath}, 'file added')
    return this.prep.addFileAsync(SIDE, doc).catch(logError)
  }

  onMoveFile (filePath: string, stats: fs.Stats, md5sum: string, old: Metadata) {
    const logError = (err) => log.error({err, path: filePath})
    const doc = this.createDoc(filePath, stats, md5sum)
    log.info({path: filePath}, `was moved from ${old.path}`)
    return this.prep.moveFileAsync(SIDE, doc, old).catch(logError)
  }

  onMoveFolder (folderPath: string, stats: fs.Stats, old: Metadata) {
    const logError = (err) => log.error({err, path: folderPath})
    const doc = this.buildDirMetadata(folderPath, stats)
    log.info({path: folderPath}, `was moved from ${old.path}`)
    this.prep.moveFolderAsync(SIDE, doc, old).catch(logError)
  }

  // New directory detected
  onAddDir (folderPath: string, stats: fs.Stats) {
    const doc = this.buildDirMetadata(folderPath, stats)
    log.info({path: folderPath}, 'folder added')
    return this.prep.putFolderAsync(SIDE, doc).catch(err => log.error({err, path: folderPath}))
  }

  // File deletion detected
  //
  // It can be a file moved out. So, we wait a bit to see if a file with the
  // same checksum is added and, if not, we declare this file as deleted.
  onUnlinkFile (filePath: string) {
    log.info({path: filePath}, 'File deleted')
    return this.prep.trashFileAsync(SIDE, {path: filePath}).catch(err => log.error({err, path: filePath}))
  }

  // Folder deletion detected
  //
  // We don't want to delete a folder before files inside it. So we wait a bit
  // after chokidar event to declare the folder as deleted.
  onUnlinkDir (folderPath: string) {
    log.info({path: folderPath}, 'Folder deleted')
    return this.prep.trashFolderAsync(SIDE, {path: folderPath}).catch(err => log.error({err, path: folderPath}))
  }

  // File update detected
  onChange (filePath: string, stats: fs.Stats, md5sum: string) {
    log.info({path: filePath}, 'File changed')
    const doc = this.createDoc(filePath, stats, md5sum)
    return this.prep.updateFileAsync(SIDE, doc)
  }
}

export default LocalWatcher
