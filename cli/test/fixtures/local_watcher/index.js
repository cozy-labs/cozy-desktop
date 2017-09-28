const Promise = require('bluebird')
const fs = require('fs-extra')
const path = require('path')

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
