/** Test scenario helpers
 *
 * @module test/support/helpers/scenarios
 * @flow
 */

const fs = require('fs')
const path = require('path')

const Promise = require('bluebird')
const fse = require('fs-extra')
const glob = require('glob')
const _ = require('lodash')
const sinon = require('sinon')

const stater = require('../../../core/local/stater')

/*::
import type { Scenario, ScenarioInit, FSAction } from '../../scenarios'
import type { Stats } from '../../../core/local/stater'
import type { ChannelEvent, EventKind } from '../../../core/local/channel_watcher/event'
import type { ChokidarEvent } from '../../../core/local/chokidar/event'
import type { TestHelpers as Helpers } from '.'
*/

const DEFAULT_FILE_CONTENT = (module.exports.DEFAULT_FILE_CONTENT = 'foo')

const debug = (...args) =>
  // eslint-disable-next-line no-console
  process.env.TESTDEBUG ? console.log(...args) : () => {}

const scenariosDir = path.resolve(__dirname, '../../scenarios')

const scenarioByPath = (module.exports.scenarioByPath = (
  scenarioPath /*: string */
) => {
  // $FlowFixMe
  const scenario = require(scenarioPath)
  scenario.name = path
    .dirname(path.normalize(scenarioPath))
    .replace(scenariosDir + path.sep, '')
    .replace(/\\/g, '/')
  scenario.path = scenarioPath

  scenario.useCaptures =
    scenario.useCaptures != null ? scenario.useCaptures : true

  return scenario
})

const statsFixer = event => {
  if (event.stats) {
    event.stats = _.defaultsDeep(
      {
        atime: new Date(event.stats.atime),
        mtime: new Date(event.stats.mtime),
        ctime: new Date(event.stats.ctime),
        birthtime: new Date(event.stats.birthtime)
      },
      event.stats
    )
  }
}

const windowsPathFixer = (filename, event) => {
  if (filename.indexOf('win32') !== -1 && process.platform !== 'win32') {
    if (event.path) event.path = event.path.replace(/\\/g, '/')
    if (event.oldPath) event.oldPath = event.oldPath.replace(/\\/g, '/')
  }
  if (filename.indexOf('win32') === -1 && process.platform === 'win32') {
    if (event.path) event.path = event.path.replace(/\//g, '\\')
    if (event.oldPath) event.oldPath = event.oldPath.replace(/\//g, '\\')
  }
}

const isTruthyVar = envVar => {
  return envVar === '1' || envVar === 'true' || envVar === true
}

module.exports.runWithBreakpoints = () => {
  const { NO_BREAKPOINTS } = process.env
  return !isTruthyVar(NO_BREAKPOINTS)
}

module.exports.runWithStoppedClient = () => {
  const { STOPPED_CLIENT } = process.env
  return isTruthyVar(STOPPED_CLIENT)
}

module.exports.runOnHFS = () => {
  const { COZY_DESKTOP_FS } = process.env
  return COZY_DESKTOP_FS === 'HFS+'
}

// TODO: Refactor to function
module.exports.scenarios = glob
  .sync(path.join(scenariosDir, '**/scenario.js*'), {})
  .map(scenarioByPath)

if (module.exports.scenarios.length === 0) {
  throw new Error(
    `No scenario found! Please check scenariosDir: ${scenariosDir}`
  )
}

const disabledScenario = scenario =>
  typeof scenario.disabled === 'string' && scenario.disabled

/**
 * For historical reasons, `disabledScenarioTest()` may receive test names
 * with file extension. Although it may be useless in many cases, stripping
 * them will make sure code always works.
 */
const disabledScenarioTest = (
  scenario /*: Scenario */,
  testName /*: string */
) =>
  disabledScenario(scenario) ||
  _.get(scenario, ['disabled', testName.replace(path.extname(testName), '')])

module.exports.disabledScenarioTest = disabledScenarioTest

module.exports.loadFSEventFiles = (
  scenario /*: Scenario & { path: string } */
) => {
  const eventFiles = glob.sync(
    path.join(path.dirname(scenario.path), 'local', '*.json*')
  )
  const disabledEventsFile = name => {
    if (process.platform === 'win32' && name.indexOf('win32') === -1) {
      return 'darwin/linux test'
    } else if (process.platform === 'linux' && name.indexOf('linux') === -1) {
      return 'darwin/win32 test'
    } else if (
      process.env.COZY_DESKTOP_FS === 'APFS' &&
      name.indexOf('hfs+') !== -1
    ) {
      return 'HFS+ test'
    } else if (
      process.env.COZY_DESKTOP_FS === 'HFS+' &&
      name.indexOf('apfs') !== -1
    ) {
      return 'APFS test'
    } else {
      return disabledScenarioTest(scenario, `local/${name}`)
    }
  }
  return eventFiles.map(f => {
    const name = path.basename(f)
    const disabled = disabledScenario(scenario) || disabledEventsFile(name)
    const events = fse.readJsonSync(f).map(e => {
      statsFixer(e)
      windowsPathFixer(name, e)
      return e
    })

    return { name, events, disabled }
  })
}

module.exports.loadParcelCaptures = (
  scenario /*: Scenario & { path: string } */
) => {
  const eventFiles = glob.sync(
    path.join(path.dirname(scenario.path), 'parcel', '*.json*')
  )
  const disabledEventsFile = name => {
    if (process.platform === 'win32' && name.indexOf('win32') === -1) {
      return 'linux test'
    } else if (process.platform === 'linux' && name.indexOf('win32') >= 0) {
      return 'win32 test'
    } else {
      return disabledScenarioTest(scenario, `parcel/${name}`)
    }
  }
  return eventFiles.map(f => {
    const name = path.basename(f)
    const disabled = disabledScenario(scenario) || disabledEventsFile(name)
    const batches = fse.readJsonSync(f).map(batch =>
      batch.map(event => {
        statsFixer(event)
        windowsPathFixer(name, event)
        return event
      })
    )

    return { name, batches, disabled }
  })
}

module.exports.loadRemoteChangesFiles = (
  scenario /*: Scenario & { path: string } */
) => {
  const pattern = path.join(path.dirname(scenario.path), 'remote', '*.json*')

  return glob.sync(pattern).map(f => {
    const name = path.basename(f)
    const disabled = disabledScenarioTest(scenario, 'remote')
    const changes = fse.readJsonSync(f)
    return { name, disabled, changes }
  })
}

const fixCapture = (
  capture /*: {| batches: ChannelEvent[][] |} | {| events: ChokidarEvent[] |} */,
  inoMap /*: Map<number, number> */
) => {
  if (capture.events) {
    // Chokidar capture
    capture.events.forEach((event /*: ChokidarEvent */) => {
      if (
        event.type === 'unlink' ||
        event.type === 'unlinkDir' ||
        event.stats == null
      )
        return

      const ino = inoMap.get(event.stats.ino)
      if (ino) event.stats.ino = ino
      event.stats = fsStatsFromObj(
        event.stats,
        event.type.endsWith('Dir') ? 'directory' : 'file'
      )
    })
  } else if (capture.batches) {
    // Channel watcher capture
    capture.batches.forEach(batch => {
      batch.forEach(event => {
        const { stats } = event
        if (stats == null) return

        const ino = inoMap.get(stats.ino)
        if (ino) stats.ino = ino

        if (!stats.fileid) {
          // Make sure `event.stats` is an instance of `fs.Stats` so
          // `stater.isDirectory()` returns the appropriate value.
          // $FlowFixMe No `fileid` means `stats` is not a `WinStats` instance
          event.stats = fsStatsFromObj(stats, event.kind)
        }
      })
    })
  }
}

const fsStatsFromObj = (module.exports.fsStatsFromObj = (
  statsObj /*: Object */,
  kind /*: EventKind */
) => {
  const {
    dev,
    mode,
    nlink,
    uid,
    gid,
    rdev,
    blksize,
    ino,
    size,
    blocks,
    atimeMs,
    mtimeMs,
    ctimeMs,
    birthtimeMs
  } = statsObj

  // $FlowFixMe `fs.Stats` constructor does accept arguments
  const stats = new fs.Stats(
    dev,
    mode,
    nlink,
    uid,
    gid,
    rdev,
    blksize,
    ino,
    size,
    blocks,
    atimeMs,
    mtimeMs,
    ctimeMs,
    birthtimeMs
  )
  if (kind === 'directory') {
    sinon.stub(stats, 'isDirectory').returns(true)
    if (process.platform === 'win32') stats.directory = true
  }
  return stats
})

const merge = async (srcPath, dstPath) => {
  let srcStats, dstStats
  try {
    srcStats = await fse.stat(srcPath)
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw err
    }
    debug('stat', { srcPath }, err)
  }

  try {
    dstStats = await fse.stat(dstPath)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      debug('stat', { dstPath }, err)
    }
  }

  if (!dstStats) {
    debug('no dst stats', { srcPath, dstPath })
    await fse.rename(srcPath, dstPath)
  } else if (dstStats.isFile()) {
    debug('dst is file', { srcPath, dstPath })
    // XXX: On Windows, `fse.rename()` does not generate the same events in all
    // situations (especially on the CI) when there's already a file at the
    // destination path.
    // Thus, to make sure we have the same events everywhere, we force the file
    // deletion before requesting the move.
    await fse.unlink(dstPath)
    await fse.rename(srcPath, dstPath)
  } else if (srcStats && srcStats.isFile()) {
    debug('file is replacing dir', { srcPath, dstPath })
    await fse.rm(dstPath, { recursive: true })
    await fse.rename(srcPath, dstPath)
  } else {
    for (const entry of await fse.readdir(srcPath)) {
      await merge(path.join(srcPath, entry), path.join(dstPath, entry))
    }
  }
  if (srcStats && srcStats.isDirectory()) {
    try {
      await fse.rm(srcPath, { recursive: true })
    } catch (err) {
      debug('rmdir', { path: srcPath }, err)
    }
  }
}

const isOutside = relpath => relpath.startsWith('../outside')

module.exports.init = async (
  scenario /*: { init: ScenarioInit } */,
  helpers /*: Helpers */,
  localCapture /*: ?({| batches: ChannelEvent[][] |} | {| events: ChokidarEvent[] |}) */
) => {
  debug('[init]')
  const { builders } = helpers.remote
  const remoteDocsToTrash = []
  const inoMap = new Map()

  if (scenario.init) {
    for (const {
      path: relpath,
      ino: fakeIno,
      trashed,
      content = DEFAULT_FILE_CONTENT
    } of scenario.init) {
      debug(relpath)

      const localPath = path.normalize(_.trimEnd(relpath, '/'))
      let stats
      if (!trashed) {
        if (relpath.endsWith('/')) {
          debug(`- create local dir: ${localPath}`)
          await fse.ensureDir(helpers.local.syncDir.abspath(localPath))
        } else {
          debug(`- create local file: ${localPath}`)
          // Writing the file seems to be changing the parent folder's mtime and
          // thus trigger a PouchDB write when launching the local watcher to
          // update the local updated_at value.
          await fse.outputFile(
            helpers.local.syncDir.abspath(localPath),
            content
          )
        }

        stats = await stater.stat(helpers.local.syncDir.abspath(localPath))
        inoMap.set(fakeIno, stats.ino)
      }

      if (isOutside(relpath)) continue

      const remoteParentPath = path.posix.join('/', path.posix.dirname(relpath))
      debug(`- retrieve remote parent: ${remoteParentPath}`)
      const remoteParent = await helpers.remote.byPath(remoteParentPath)
      if (!remoteParent) {
        debug(`Could not retrieve remote parent: ${remoteParentPath}`)
        return
      }

      const remoteName = path.posix.basename(relpath)
      const remotePath = path.posix.join(remoteParent.path, remoteName)

      if (relpath.endsWith('/')) {
        debug(
          `- create${trashed ? ' and trash' : ''} remote dir: ${remotePath}`
        )
        const remoteDir = await builders
          .remoteDir()
          .name(remoteName)
          .inDir(remoteParent)
          .create()

        if (trashed) {
          remoteDocsToTrash.push(remoteDir)
        } else if (stats) {
          debug(`- create dir metadata: ${relpath}`)
          // We should always have stats if doc is not trashed
          const doc = builders
            .metadir()
            .fromRemote(remoteDir)
            .upToDate()
            .build()
          stater.assignInoAndFileId(doc, stats)
          stater.assignInoAndFileId(doc.local, stats)

          await helpers.pouch.put(doc)
        }
      } else {
        debug(
          `- create${trashed ? ' and trash' : ''} remote file: ${remotePath}`
        )
        const remoteFile = await builders
          .remoteFile()
          .name(remoteName)
          .inDir(remoteParent)
          .data(content)
          .executable(false)
          .create()

        if (trashed) {
          remoteDocsToTrash.push(remoteFile)
        } else if (stats) {
          debug(`- create file metadata: ${relpath}`)
          // We should always have stats if doc is not trashed
          const doc = builders
            .metafile()
            .fromRemote(remoteFile)
            .upToDate()
            .build()
          stater.assignInoAndFileId(doc, stats)
          stater.assignInoAndFileId(doc.local, stats)

          await helpers.pouch.put(doc)
        }
      } // if relpath ...
    } // for (... of scenario.init)

    if (localCapture) {
      fixCapture(localCapture, inoMap)
    }
  }

  for (const remoteDoc of remoteDocsToTrash) {
    debug(`- trashing remote ${remoteDoc.type}: ${remoteDoc.path}`)
    try {
      await helpers.remote.destroyById(remoteDoc._id)
    } catch (err) {
      if (err.status === 400) continue
      throw err
    }
  }
}

const saveInodeChange = async (inodeChanges, abspath, action) => {
  // $FlowFixMe if action.dst is not defined, action.path is
  const newPath = action.dst ? action.dst : action.path
  const stats = await stater.stat(abspath(newPath))
  inodeChanges.unshift({ path: newPath, ino: stats.ino })

  if (action.dst && stater.isDirectory(stats)) {
    for (const child of await fse.readdir(abspath(action.dst))) {
      await saveInodeChange(inodeChanges, abspath, {
        src: '',
        dst: path.join(action.dst, child)
      })
    }
  }
}

module.exports.runActions = async (
  scenario /*: { actions: Array<FSAction>, name?: string } */,
  abspath /*: (string) => string */,
  {
    skipWait,
    saveInodeChanges = true
  } /*: {skipWait?: true, saveInodeChanges?: boolean} */ = {}
) => {
  const inodeChanges /*: Array<{ path: string, ino: number }> */ = []

  debug('[actions]')
  await Promise.each(scenario.actions, async action => {
    switch (action.type) {
      case 'mkdir':
        debug('- mkdir', action.path)
        await fse.ensureDir(abspath(action.path))
        break

      case 'create_file':
        debug('- create_file', action.path)
        await fse.outputFile(abspath(action.path), action.content || 'whatever')
        break

      case 'update_file':
        debug('- update_file', action.path)
        await fse.writeFile(abspath(action.path), action.content)
        break

      case 'trash':
        debug('- trash', action.path)
        return fse.remove(abspath(action.path))

      case 'delete':
        debug('- delete', action.path)
        return fse.remove(abspath(action.path))

      case 'mv':
        debug('- mv', action.force ? 'force' : '', action.src, action.dst)
        if (action.merge) {
          await merge(abspath(action.src), abspath(action.dst))
        } else if (action.force) {
          await fse.move(abspath(action.src), abspath(action.dst), {
            overwrite: true
          })
        } else {
          await fse.rename(abspath(action.src), abspath(action.dst))
        }
        break

      case 'wait':
        if (skipWait) return Promise.resolve()
        debug('- wait', action.ms)
        return Promise.delay(action.ms)

      default:
        return Promise.reject(
          new Error(
            `Unknown action ${action.type} ${
              scenario.name ? 'for scenario' + scenario.name : ''
            }`
          )
        )
    }

    return !!saveInodeChanges && saveInodeChange(inodeChanges, abspath, action)
  })

  return inodeChanges
}
