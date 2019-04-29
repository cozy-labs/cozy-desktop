/* @flow */

const fse = require('fs-extra')
const path = require('path')

const rootDir = path.resolve(__dirname, '../..')

// Where can we put temporary stuff
const tmpDir = path.resolve(process.env.COZY_DESKTOP_DIR || 'tmp')

// Where is stuff from current & previous test runs stored
const testRunsDir = path.join(tmpDir, 'test')

// Were can we put stuff for the current test run
const testRunDir = path.join(testRunsDir, `${+new Date()}`)

module.exports = {
  emptyForTestFile
}

// Usage:
//     await TmpDir.ensureEmpty(__filename)
async function emptyForTestFile(filename /*: string */) /*: Promise<string> */ {
  const fpath = pathForTestFile(filename)
  await fse.emptyDir(fpath)
  return fpath
}

function pathForTestFile(filename /*: string */) /*: string */ {
  const abspath = filename.replace(/.(js|json)$/, '')
  const relpath = abspath.startsWith(rootDir)
    ? abspath.slice(rootDir.length + 1)
    : abspath
  return path.join(testRunDir, relpath)
}
