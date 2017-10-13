const Promise = require('bluebird')
const {dirname, basename} = require('path')
const local = require('../local_watcher')
const metadata = require('../../../src/metadata')
const _ = require('lodash')

// TODO: rename local_scenarios into scenarios
module.exports.scenarios = local.scenarios
module.exports.loadFSEventFiles = local.loadFSEventFiles

module.exports.runActions = (client, scenario) => {
  const debug = process.env.NODE_ENV !== 'test' || process.env.DEBUG != null ? console.log : () => {}
  debug(`actions:`)
  return Promise.each(scenario.actions, async (action) => {
    const p = '/' + action.path
    switch (action.type) {
      case 'mkdir':
        debug('- mkdir', action.path)
        return client.files.createDirectoryByPath('/' + p)

      case '>':
        debug('- >', action.path)
        const parent = await client.files.createDirectoryByPath(dirname(p))
        return client.files.create('whatever', {
          name: basename(p),
          dirID: parent._id,
          contentType: 'text/plain'
        })

      case '>>':
        debug('- >>', action.path)
        const f = await client.files.statByPath(p)
        return client.files.updateById(f._id, 'whatever blah', {
          contentType: 'text/plain'
        })

      case 'rm':
        debug('- rm', action.path)
        const f2 = await client.files.statByPath(p)
        return client.files.trashById(f2._id)

      case 'mv':
        debug('- mv', action.src, action.dst)
        const newParent = await client.files.createDirectoryByPath(dirname('/' + action.dst))
        return client.files.updateAttributesByPath('/' + action.src, {
          dirID: newParent._id,
          path: '/' + action.dst,
          name: basename('/' + action.dst)
        })

      case 'wait':
        debug('- wait', action.ms)
        return Promise.delay(action.ms)

      default:
        return Promise.reject(new Error(`Unknown action ${action.type} for scenario ${scenario.name}`))
    }
  })
}

module.exports.applyInit = async function (mochacontext, scenario) {
  const client = mochacontext.remoteCozy.client
  for (let {path: relpath, ino} of scenario.init) {
    if (relpath.endsWith('/')) {
      relpath = _.trimEnd(relpath, '/') // XXX: Check in metadata.id?
      if (process.platform === 'win32' &&
          mochacontext.currentTest.title.match(/win32/)) relpath = relpath.replace(/\//g, '\\').toUpperCase()
      let rem = await client.files.createDirectoryByPath('/' + relpath)
      await mochacontext.pouch.put({
        _id: metadata.id(relpath),
        docType: 'folder',
        updated_at: new Date(),
        path: relpath,
        ino,
        tags: [],
        sides: {local: 1, remote: 1},
        remote: {_id: rem._id, _rev: rem._rev}
      })
    } else {
      if (process.platform === 'win32' &&
          mochacontext.currentTest.title.match(/win32/)) relpath = relpath.replace(/\//g, '\\').toUpperCase()
      const parent = await client.files.createDirectoryByPath(dirname('/' + relpath))
      let rem = await client.files.create(Buffer.from(''), {
        dirID: parent._id,
        name: basename('/' + relpath)
      })
      await mochacontext.pouch.put({
        _id: metadata.id(relpath),
        md5sum: '1B2M2Y8AsgTpgAmY7PhCfg==', // ''
        class: 'text',
        docType: 'file',
        executable: false,
        updated_at: new Date(),
        mime: 'text/plain',
        path: relpath,
        ino,
        size: 0,
        tags: [],
        sides: {local: 1, remote: 1},
        remote: {_id: rem._id, _rev: rem._rev}
      })
    }
  }
}
