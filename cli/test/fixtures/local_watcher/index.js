import fs from 'fs-extra'
import path from 'path'

export const scenarios =
  fs.readdirSync(__dirname)
    .filter(name => name.endsWith('.scenario.js'))
    .map(name => {
      const scenarioPath = path.join(__dirname, name)
      return {
        ...require(scenarioPath),
        name,
        path: scenarioPath
      }
    })

export const loadFSEvents = (scenario, platform) => {
  const eventsFile = scenario.path.replace(/\.scenario\.js$/, `.fsevents.${platform}.json`)
  return fs.readJson(eventsFile)
}
