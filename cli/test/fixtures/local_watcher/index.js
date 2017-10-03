const Promise = require('bluebird')
const fs = require('fs-extra')
const path = require('path')

// TODO: Create one dir per scenario with an fsevents subdir
module.exports.scenarios =
  fs.readdirSync(__dirname)
    .filter(name => name.endsWith('.scenario.js'))
    .map(name => {
      const scenarioPath = path.join(__dirname, name)
      const scenario = require(scenarioPath)
      scenario.name = name
      scenario.path = scenarioPath
      return scenario
    })

module.exports.loadFSEvents = (scenario, platform) => {
  const eventsFile = scenario.path.replace(/\.scenario\.js$/, `.fsevents.${platform}.json`)
  return fs.readJson(eventsFile)
}

module.exports.runActions = (scenario, abspath) => {
  console.log(`actions:`)
  return Promise.each(scenario.actions, action => {
    switch (action.type) {
      case 'mkdir':
        console.log('- mkdir', action.path)
        return fs.ensureDir(abspath(action.path))

      case '>':
        console.log('- >', action.path)
        return fs.outputFile(abspath(action.path), 'whatever')

      case 'rm':
        console.log('- rm', action.path)
        return fs.remove(abspath(action.path))

      case 'mv':
        console.log('- mv', action.src, action.dst)
        return fs.rename(abspath(action.src), abspath(action.dst))

      case 'wait':
        console.log('- wait', action.ms)
        return Promise.delay(action.ms)

      default:
        return Promise.reject(new Error(`Unknown action ${action.type} for scenario ${scenario.name}`))
    }
  })
}
