const Promise = require('bluebird')
const fs = require('fs-extra')
const glob = require('glob')
const path = require('path')

// TODO: Create one dir per scenario with an fsevents subdir
module.exports.scenarios =
  glob.sync(path.join(__dirname, '../scenarios/**/scenario.js'), {})
    .map(scenarioPath => {
      const name = path.basename(path.dirname(scenarioPath))
      const scenario = require(scenarioPath)
      scenario.name = name
      scenario.path = scenarioPath
      return scenario
    })

module.exports.loadFSEventFiles = (scenario) => {
  const eventFiles = glob.sync(path.join(path.dirname(scenario.path), 'local', '*.json'))
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
