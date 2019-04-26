/** Instruments the code to compute test coverage.
 *
 * We don't instrument renderer code for now since it is mostly Elm code.
 *
 * See:
 * https://github.com/jprichardson/electron-mocha#code-coverage
 * https://github.com/tropy/tropy/blob/d585b79268b4e4e614feb100d259d7b1a2be02a3/test/support/coverage.js
 * https://electronjs.org/docs/api/process#processtype
 */

const glob = require('glob')
const path = require('path')
const fse = require('fs-extra')
const { hookRequire } = require('istanbul-lib-hook')
const { createInstrumenter } = require('istanbul-lib-instrument') // eslint-disable-line node/no-extraneous-require

const cov = (global.__coverage__ = {})

const root = path.resolve(__dirname, '..', '..')
const tmpd = path.resolve(root, '.nyc_output')

const pattern = '{core,gui/js}/**/*.js'
const fileset = new Set(glob.sync(pattern, { root, realpath: true }))

const instrumenter = createInstrumenter()
const shouldInstrument = fileset.has.bind(fileset)
const instrumentSync = instrumenter.instrumentSync.bind(instrumenter)

fse.ensureDirSync(tmpd)
hookRequire(shouldInstrument, instrumentSync, {})
process.on('exit', () => {
  for (let file of fileset) {
    if (!cov[file]) {
      // Files that are not touched by code ran by the test runner are
      // manually instrumented, to illustrate the missing coverage.
      instrumentSync(fse.readFileSync(file, 'utf-8'), file)
      cov[file] = instrumenter.lastFileCoverage()
    }
  }

  fse.writeFileSync(
    path.join(tmpd, `${process.type}.json`),
    JSON.stringify(cov),
    'utf-8'
  )
})
