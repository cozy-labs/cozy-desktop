const Promise = require('bluebird')
const fs = require('fs-extra')
const glob = require('glob')
const path = require('path')
const metadata = require('../../../src/metadata')
const _ = require('lodash')

// TODO: Create one dir per scenario with an fsevents subdir
module.exports.scenarios =
  glob.sync(path.join(__dirname, '**/scenario.js'), {})
    .map(scenarioPath => {
      const name = path.basename(path.dirname(scenarioPath))
      const scenario = require(scenarioPath)
      scenario.name = name
      scenario.path = scenarioPath
      return scenario
    })

module.exports.loadFSEventFiles = (scenario) => {
  const eventFiles = glob.sync(path.join(path.dirname(scenario.path), 'fsevents.*.json'))
  return eventFiles
    .map(f => ({name: path.basename(f), events: fs.readJsonSync(f)}))
}

module.exports.runActions = (scenario, abspath) => {
  const debug = process.env.NODE_ENV !== 'test' || process.env.DEBUG != null ? console.log : () => {}
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

      case 'rm':
        debug('- rm', action.path)
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

module.exports.applyInit = async function (mochacontext, scenario, abspath) {
  for (let {path: relpath, ino} of scenario.init) {
    if (relpath.endsWith('/')) {
      relpath = _.trimEnd(relpath, '/') // XXX: Check in metadata.id?
      if (process.platform === 'win32' &&
          mochacontext.currentTest.title.match(/win32/)) relpath = relpath.replace(/\//g, '\\').toUpperCase()
      await fs.ensureDir(abspath(relpath))
      await mochacontext.pouch.put({
        _id: metadata.id(relpath),
        docType: 'folder',
        updated_at: new Date(),
        path: relpath,
        ino,
        tags: [],
        sides: {local: 1, remote: 1}
      })
    } else {
      if (process.platform === 'win32' &&
          mochacontext.currentTest.title.match(/win32/)) relpath = relpath.replace(/\//g, '\\').toUpperCase()
      await fs.outputFile(abspath(relpath), '')
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
        sides: {local: 1, remote: 1}
      })
    }
  }
}
