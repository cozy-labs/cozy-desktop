/* @flow */

const Promise = require('bluebird')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')

const metadata = require('../../core/metadata')
const Pouch = require('../../core/pouch')
const { RemoteCozy } = require('../../core/remote/cozy')

const configHelpers = require('../../test/support/helpers/config')
const cozyHelpers = require('../../test/support/helpers/cozy')

const debug = process.env.TESTDEBUG != null ? console.log : (...args) => {}

const createInitialTree = async function (scenario /*: * */, cozy /*: * */, pouch /*: Pouch */) {
  if (!scenario.init) return
  debug('[init]')
  for (let doc of scenario.init) {
    let relpath = '/' + doc.path
    if (relpath.endsWith('/')) {
      relpath = _.trimEnd(relpath, '/') // XXX: Check in metadata.id?
      debug('- mkdir', relpath)
      const remoteDir = await cozy.files.createDirectoryByPath(relpath)
      await pouch.db.put({
        _id: metadata.id(relpath),
        docType: 'folder',
        updated_at: new Date(),
        path: relpath,
        ino: doc.ino,
        tags: [],
        sides: {local: 1, remote: 1},
        remote: {_id: remoteDir._id, _rev: remoteDir._rev}
      })
    } else {
      debug('- create_file', relpath)
      const parent = await cozy.files.statByPath(path.posix.dirname(relpath))
      let remoteFile = await cozy.files.create(Buffer.from(''), {
        dirID: parent._id,
        name: path.basename(relpath)
      })
      await pouch.db.put({
        _id: metadata.id(relpath),
        md5sum: '1B2M2Y8AsgTpgAmY7PhCfg==', // ''
        class: 'text',
        docType: 'file',
        executable: false,
        updated_at: new Date(),
        mime: 'text/plain',
        path: relpath,
        ino: doc.ino,
        size: 0,
        tags: [],
        sides: {local: 1, remote: 1},
        remote: {_id: remoteFile._id, _rev: remoteFile._rev}
      })
    }
  }
}

const runActions = (scenario /*: * */, cozy /*: * */) => {
  debug('[actions]')
  return Promise.each(scenario.actions, async (action) => {
    switch (action.type) {
      case 'mkdir':
        debug('- mkdir', action.path)
        return cozy.files.createDirectoryByPath(`/${action.path}`)

      case 'create_file':
        debug('- create_file', action.path)
        {
          const parentDir = await cozy.files.statByPath(
            `/${path.posix.dirname(action.path)}`)
          return cozy.files.create('whatever', {
            name: path.posix.basename(action.path),
            dirID: parentDir._id,
            contentType: 'text/plain'
          })
        }

      case 'update_file':
        debug('- update_file', action.path)
        {
          const remoteFile = await cozy.files.statByPath(`/${action.path}`)
          return cozy.files.updateById(remoteFile._id, action.content, {
            contentType: 'text/plain'
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
          const remoteDoc = await cozy.files.statByPath(`/.cozy_trash/${action.pathInTrash}`)
          return cozy.files.restoreById(remoteDoc._id)
        }

      case 'mv':
        debug('- mv', action.src, action.dst)
        {
          const newParent = await cozy.files.statByPath(
            `/${path.posix.dirname(action.dst)}`)
          const remoteDoc = await cozy.files.statByPath(`/${action.src}`)
          if (action.merge) throw new Error('Move.merge not implemented on remote')
          if (action.force) {
            try {
              const remoteOverwriten = await cozy.files.statByPath(`/${action.dst}`)
              await cozy.files.trashById(remoteOverwriten._id)
            } catch (err) {
              debug('force not forced', err)
            }
          }
          return cozy.files.updateAttributesById(remoteDoc._id, {
            dir_id: newParent._id,
            // path: '/' + action.dst,
            name: path.posix.basename(action.dst)
          })
        }

      case 'wait':
        debug('- wait', action.ms)
        // FIXME: No need to wait on remote?
        return Promise.delay(action.ms)

      default:
        return Promise.reject(new Error(
          `Unknown action ${action.type} for scenario ${scenario.name}`))
    }
  })
}

const setupConfig = () => {
  const context = {}
  configHelpers.createConfig.call(context)
  configHelpers.registerClient.call(context)
  const {config} = context
  return config
}

const setupPouch = async (config /*: * */) => {
  const pouch = new Pouch(config)
  await pouch.addAllViewsAsync()
  return pouch
}

const captureScenario = async (scenario /*: * */) => {
  // Setup
  const config = setupConfig()
  const pouch = await setupPouch(config)
  await cozyHelpers.deleteAll()
  await createInitialTree(scenario, cozyHelpers.cozy, pouch)
  const remoteCozy = new RemoteCozy(config)
  const {last_seq} = await remoteCozy.changes()

  // Run
  await runActions(scenario, cozyHelpers.cozy)

  // Capture
  const {docs} = await await remoteCozy.changes(last_seq)
  const json = JSON.stringify(docs, null, 2)
  const changesFile = scenario.path
    .replace(/scenario\.js/, path.join('remote', 'changes.json'))
  await fse.outputFile(changesFile, json)

  return path.basename(changesFile)
}

module.exports = {
  name: 'remote',
  createInitialTree,
  runActions,
  captureScenario
}
