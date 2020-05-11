/** Capture local/remote changes to be replayed in test scenarios.
 *
 * @module dev/capture
 * @flow
 */

const program = require('commander')
const path = require('path')
const { app } = require('electron')

const local = require('./capture/local')
const remote = require('./capture/remote')
const scenarioHelpers = require('../test/support/helpers/scenarios')

program
  .description('Capture FS events')
  .arguments('[scenarios...]')
  .option('-l, --local', 'Local events only')
  .option('-r, --remote', 'Remove events only')
  .parse(process.argv)

const scenarioArgPattern = new RegExp(
  path.posix.join('^.*', '?test', 'scenarios', `(.+)`, '(scenario.js)?')
)

const scenarios = args => {
  if (args.length === 0) return scenarioHelpers.scenarios

  return args.map(arg => {
    const match = arg.match(scenarioArgPattern)
    if (match) {
      return scenarioHelpers.scenarioByPath(
        path.join(__dirname, '..', 'test', 'scenarios', match[1], 'scenario.js')
      )
    } else {
      throw new Error(`Invalid argument: ${arg}`)
    }
  })
}

const sides = []
if (program.local || !program.remote) sides.push(local)
if (program.remote || !program.local) sides.push(remote)

const captureScenariosEvents = async (scenarios, sides) => {
  try {
    // eslint-disable-next-line no-console
    console.log('test/scenarios/')
    for (let scenario of scenarios) {
      // eslint-disable-next-line no-console
      console.log(`  ${scenario.name}/`)
      for (let side of sides) {
        try {
          const outputFilename /*: ?string */ = await side.captureScenario(
            scenario
          )
          if (outputFilename) {
            // eslint-disable-next-line no-console
            console.log(`    \x1B[1;32m✓\x1B[0m ${outputFilename}`)
          } else {
            // eslint-disable-next-line no-console
            console.log(`    \x1B[1;37m-\x1B[0m ${scenario.path} skipped`)
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log(`    \x1B[1;31m✗\x1B[0m ${side.name}/`)
          // eslint-disable-next-line no-console
          console.error('\x1B[1;31m', err, '\x1B[0m')
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('✨  Done.')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err)
  }
}

captureScenariosEvents(scenarios(program.args), sides)
  .then(() => app.exit(0))
  .catch(err => {
    // eslint-disable-next-line no-console
    console.error(err)
    app.exit(1)
  })
