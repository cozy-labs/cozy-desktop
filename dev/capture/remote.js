/** Capture remote changes to be replayed in test scenarios.
 *
 * @module dev/capture/remote
 * @flow
 */

const Promise = require('bluebird')
const fse = require('fs-extra')
const path = require('path')
const _ = require('lodash')

const { Pouch } = require('../../core/pouch')
const { RemoteCozy } = require('../../core/remote/cozy')
const { ROOT_DIR_ID } = require('../../core/remote/constants')
const timestamp = require('../../core/utils/timestamp')

const configHelpers = require('../../test/support/helpers/config')
const cozyHelpers = require('../../test/support/helpers/cozy')
const Builders = require('../../test/support/builders')

/*::
import type { MetadataRemoteInfo } from '../../core/metadata'
import type { FullRemoteFile, RemoteDir } from '../../core/remote/document'
import type { RemoteTree } from '../../test/support/helpers/remote'
*/

// eslint-disable-next-line no-console,no-unused-vars
const debug = process.env.TESTDEBUG != null ? console.log : (...args) => {}

const ROOT_DIR = {
  _id: ROOT_DIR_ID,
  path: '/'
}

const createInitialTree = async function (
  scenario /*: * */,
  cozy /*: * */,
  pouch /*: Pouch */
) {
  if (!scenario.init) return

  const builders = new Builders({ cozy, pouch })
  const remoteDocs /*: RemoteTree */ = {}
  const remoteDocsToTrash /*: Array<FullRemoteFile|RemoteDir> */ = []

  debug('[init]')
  for (const initDoc of scenario.init) {
    const remotePath = '/' + _.trimEnd(initDoc.path, '/')
    const remoteName = path.posix.basename(remotePath)
    const remoteParent = remoteDocs[path.posix.dirname(remotePath)] || ROOT_DIR
    const updatedAt = new Date()

    if (initDoc.path.endsWith('/')) {
      debug('- create dir', remotePath)
      const remoteDir = await builders
        .remoteDir()
        .inDir(remoteParent)
        .name(remoteName)
        .createdAt(...timestamp.spread(updatedAt))
        .updatedAt(...timestamp.spread(updatedAt))
        .create()
      remoteDocs[remotePath] = remoteDir

      if (initDoc.trashed) {
        remoteDocsToTrash.push(remoteDir)
      } else {
        await builders
          .metadir()
          .fromRemote(remoteDir)
          .ino(initDoc.ino)
          .upToDate()
          .create()
      }
    } else {
      debug('- create_file', remotePath)
      const remoteFile = await builders
        .remoteFile()
        .inDir(remoteParent)
        .name(remoteName)
        .data(initDoc.content || 'whatever')
        .executable(false)
        .createdAt(...timestamp.spread(updatedAt))
        .updatedAt(...timestamp.spread(updatedAt))
        .create()
      remoteDocs[remotePath] = remoteFile

      if (initDoc.trashed) {
        remoteDocsToTrash.push(remoteFile)
      } else {
        await builders
          .metafile()
          .fromRemote(remoteFile)
          .ino(initDoc.ino)
          .upToDate()
          .create()
      }
    }
  }

  for (const remoteDoc of remoteDocsToTrash) {
    debug(`- trashing remote ${remoteDoc.type}: ${remoteDoc.path}`)
    try {
      await cozy.files.trashById(remoteDoc._id)
    } catch (err) {
      if (err.status === 400) continue
      throw err
    }
  }
}

const runActions = (scenario /*: * */, cozy /*: * */) => {
  debug('[actions]')
  return Promise.each(scenario.actions, async action => {
    const now = new Date().toISOString()

    switch (action.type) {
      case 'mkdir':
        debug('- mkdir', action.path)
        return cozy.files.createDirectoryByPath(`/${action.path}`, {
          createdAt: now,
          updatedAt: now
        })

      case 'create_file':
        debug('- create_file', action.path)
        {
          const parentDir = await cozy.files.statByPath(
            `/${path.posix.dirname(action.path)}`
          )
          return cozy.files.create(action.content || 'whatever', {
            name: path.posix.basename(action.path),
            dirID: parentDir._id,
            contentType: 'text/plain',
            createdAt: now,
            updatedAt: now
          })
        }

      case 'update_file':
        debug('- update_file', action.path)
        {
          const remoteFile = await cozy.files.statByPath(`/${action.path}`)
          return cozy.files.updateById(remoteFile._id, action.content, {
            contentType: 'text/plain',
            updatedAt: now
          })
        }

      case 'trash':
        debug('- trash', action.path)
        {
          const remoteDoc = await cozy.files.statByPath(`/${action.path}`)
          return cozy.files.trashById(remoteDoc._id)
        }

      case 'delete':
        debug('- delete', action.path)
        {
          const remoteDoc = await cozy.files.statByPath(`/${action.path}`)
          if (!remoteDoc.trashed) await cozy.files.trashById(remoteDoc._id)
          return cozy.files.destroyById(remoteDoc._id)
        }

      case 'restore':
        debug('- restore .cozy_trash/', action.pathInTrash)
        {
          const remoteDoc = await cozy.files.statByPath(
            `/.cozy_trash/${action.pathInTrash}`
          )
          return cozy.files.restoreById(remoteDoc._id)
        }

      case 'mv':
        debug('- mv', action.src, action.dst)
        {
          if (action.merge)
            throw new Error('Move.merge not implemented on remote')
          let opts = {}
          try {
            if (
              path.posix.dirname(action.src) != path.posix.dirname(action.dst)
            ) {
              const newParent = await cozy.files.statByPath(
                `/${path.posix.dirname(action.dst)}`
              )
              opts.dir_id = newParent._id
            }
            if (
              path.posix.basename(action.src) != path.posix.basename(action.dst)
            ) {
              opts.name = path.posix.basename(action.dst)
            }
            const remoteDoc = await cozy.files.statByPath(`/${action.src}`)
            return await cozy.files.updateAttributesById(remoteDoc._id, opts)
          } catch (err) {
            if (err.status === 409) {
              // Remove conflicting doc
              const remoteOverwriten = await cozy.files.statByPath(
                `/${action.dst}`
              )
              await cozy.files.destroyById(remoteOverwriten._id)

              // Retry move
              const remoteDoc = await cozy.files.statByPath(`/${action.src}`)
              return await cozy.files.updateAttributesById(remoteDoc._id, opts)
            } else {
              throw err
            }
          }
        }

      case 'wait':
        debug('- wait', action.ms)
        // FIXME: No need to wait on remote?
        return Promise.delay(action.ms)

      default:
        return Promise.reject(
          new Error(
            `Unknown action ${action.type} for scenario ${scenario.name}`
          )
        )
    }
  })
}

const setupConfig = () => {
  const context = {}
  configHelpers.createConfig.call(context)
  configHelpers.registerClient.call(context)
  const { config } = context
  return config
}

const setupPouch = async (config /*: * */) => {
  const pouch = new Pouch(config)
  await pouch.addAllViews()
  return pouch
}

const captureScenario = async (scenario /*: * */) => {
  if (
    (scenario.platforms && !scenario.platforms.includes(process.platform)) ||
    (scenario.side && scenario.side !== 'remote')
  ) {
    return
  }

  // Setup
  const config = setupConfig()
  const pouch = await setupPouch(config)
  await cozyHelpers.deleteAll()
  await createInitialTree(scenario, cozyHelpers.cozy, pouch)
  const remoteCozy = new RemoteCozy(config)
  const { last_seq } = await remoteCozy.changes()

  // Run
  await runActions(scenario, cozyHelpers.cozy)

  // Capture
  const { docs } = await await remoteCozy.changes(last_seq)
  const json = JSON.stringify(docs, null, 2)
  const changesFile = scenario.path.replace(
    /scenario\.js/,
    path.join('remote', 'changes.json')
  )
  await fse.outputFile(changesFile, json)

  return path.basename(changesFile)
}

module.exports = {
  name: 'remote',
  createInitialTree,
  runActions,
  captureScenario
}
