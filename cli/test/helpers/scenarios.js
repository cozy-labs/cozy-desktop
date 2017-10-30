// TODO: Rename to cli/test/helpers/scenarios.js

const Promise = require('bluebird')
const fs = require('fs-extra')
const glob = require('glob')
const _ = require('lodash')
const path = require('path')

const metadata = require('../../src/metadata')

const { cozy } = require('./cozy')

const debug = process.env.DEBUG ? console.log : () => {}

const disabledExtension = '.DISABLED'

const scenarioByPath = module.exports.scenarioByPath = scenarioPath => {
  // $FlowFixMe
  const scenario = require(scenarioPath)
  scenario.name = path.basename(path.dirname(scenarioPath), disabledExtension)
  scenario.path = scenarioPath
  scenario.disabled = scenarioPath.endsWith(disabledExtension) && 'scenario disabled'

  if (process.platform === 'win32' && scenario.expected && scenario.expected.prepCalls) {
    for (let prepCall of scenario.expected.prepCalls) {
      if (prepCall.src) {
        prepCall.src = prepCall.src.split('/').join('\\').toUpperCase()
        // @TODO why is src in maj
      }
      if (prepCall.path) prepCall.path = prepCall.path.split('/').join('\\')
      if (prepCall.dst) prepCall.dst = prepCall.dst.split('/').join('\\')
    }
  }

  return scenario
}

// TODO: Refactor to function
module.exports.scenarios =
  glob.sync(path.join(__dirname, '../scenarios/**/scenario.js*'), {})
    .map(scenarioByPath)

module.exports.loadFSEventFiles = (scenario) => {
  const eventFiles = glob.sync(path.join(path.dirname(scenario.path), 'local', '*.json*'))
  const disabledEventsFile = (name) => {
    if (process.platform === 'win32' && name.indexOf('win32') === -1) {
      return 'darwin/linux test'
    } else if (name.endsWith(disabledExtension)) {
      return 'disabled case'
    }
  }
  return eventFiles
    .map(f => {
      const name = path.basename(f)
      const disabled = scenario.disabled || disabledEventsFile(name)
      const events = fs.readJsonSync(f).map(e => {
        if (e.stats) {
          e.stats.mtime = new Date(e.stats.mtime)
          e.stats.ctime = new Date(e.stats.ctime)
        }
        if (name.indexOf('win32') !== -1 && process.platform !== 'win32') {
          e.path = e.path.replace(/\\/g, '/')
        }
        if (name.indexOf('win32') === -1 && process.platform === 'win32') {
          e.path = e.path.replace(/\//g, '\\')
        }
        return e
      })

      return {name, events, disabled}
    })
}

module.exports.loadRemoteChangesFiles = (scenario) => {
  const pattern = path.join(path.dirname(scenario.path), 'remote', '*.json*')

  return glob.sync(pattern).map(f => {
    const name = path.basename(f)
    const disabled = scenario.disabled || f.endsWith(disabledExtension)
    const changes = fs.readJsonSync(f)
    return {name, disabled, changes}
  })
}

module.exports.init = async (scenario, pouch, abspath, relpathFix, trueino) => {
  debug('init')
  const remoteDocsToTrash = []
  for (let {path: relpath, ino, trashed} of scenario.init) {
    debug(relpath)
    const isOutside = relpath.startsWith('../outside')
    let remoteParent
    if (!isOutside) {
      debug('retrieve remote parent...')
      const remoteParentPath = path.posix.join('/', path.posix.dirname(relpath))
      remoteParent = await cozy.files.statByPath(remoteParentPath)
    }
    const lastModifiedDate = new Date('2011-04-11T10:20:30Z')
    if (relpath.endsWith('/')) {
      relpath = _.trimEnd(relpath, '/') // XXX: Check in metadata.id?
      relpath = relpathFix(relpath)

      if (!trashed) {
        debug('create local dir...')
        await fs.ensureDir(abspath(relpath))
        if (trueino) ino = (await fs.stat(abspath(relpath))).ino
      }

      const doc = {
        _id: metadata.id(relpath),
        docType: 'folder',
        updated_at: lastModifiedDate,
        path: relpath,
        ino,
        tags: [],
        sides: {local: 1, remote: 1}
      }

      if (!isOutside) {
        debug('create remote dir...', trashed ? '(trashed)' : '')
        const remoteDir = await cozy.files.createDirectory({
          name: path.basename(relpath),
          dirID: remoteParent._id,
          lastModifiedDate
        })
        doc.remote = _.pick(remoteDir, ['_id', '_rev'])
        if (trashed) remoteDocsToTrash.push(remoteDir)
        else {
          debug('create dir metadata...')
          await pouch.put(doc)
        }
      }
    } else {
      relpath = relpathFix(relpath)
      const content = 'foo'
      const md5sum = 'rL0Y20zC+Fzt72VPzMSk2A=='

      if (!trashed) {
        debug('create local file...')
        await fs.outputFile(abspath(relpath), content)
        if (trueino) ino = (await fs.stat(abspath(relpath))).ino
      }

      const doc = {
        _id: metadata.id(relpath),
        md5sum,
        class: 'text',
        docType: 'file',
        executable: false,
        updated_at: lastModifiedDate,
        mime: 'text/plain',
        path: relpath,
        ino,
        size: 0,
        tags: [],
        sides: {local: 1, remote: 1}
      }
      if (!isOutside) {
        debug('create remote file...', trashed ? '(trashed)' : '')
        const remoteFile = await cozy.files.create(content, {
          name: path.basename(relpath),
          dirID: remoteParent._id,
          checksum: md5sum,
          contentType: 'text/plain',
          lastModifiedDate
        })
        doc.remote = _.pick(remoteFile, ['_id', '_rev'])
        if (trashed) remoteDocsToTrash.push(remoteFile)
        else {
          debug('create file metadata...')
          await pouch.put(doc)
        }
      }
    } // if relpath ...
  } // for (... of scenario.init)
  for (let remoteDoc of remoteDocsToTrash) {
    await cozy.files.trashById(remoteDoc._id)
  }
}

module.exports.runActions = (scenario, abspath) => {
  debug(`actions:`)
  return Promise.each(scenario.actions, action => {
    switch (action.type) {
      case 'mkdir':
        debug('- mkdir', action.path)
        return fs.ensureDir(abspath(action.path))

      case '>':
        debug('- >', action.path)
        return fs.outputFile(abspath(action.path), 'whatever')

      case '>>':
        debug('- >>', action.path)
        return fs.appendFile(abspath(action.path), ' blah')

      case 'trash':
        debug('- trash', action.path)
        return fs.remove(abspath(action.path))

      case 'delete':
        debug('- delete', action.path)
        return fs.remove(abspath(action.path))

      case 'mv':
        debug('- mv', action.src, action.dst)
        return fs.rename(abspath(action.src), abspath(action.dst))

      case 'wait':
        debug('- wait', action.ms)
        return Promise.delay(action.ms)

      default:
        return Promise.reject(new Error(`Unknown action ${action.type} for scenario ${scenario.name}`))
    }
  })
}
