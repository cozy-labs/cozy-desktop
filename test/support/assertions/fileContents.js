/* @flow */

const _ = require('lodash')
const should = require('should')

/*::
import type { ContextDir } from '../helpers/context_dir'
*/

// Usage:
//
//     const dir = new ContextDir(...)
//     await should(dir).have.fileContents({
//       file1: 'content 1',
//       file2: 'content 2'
//     })
should.Assertion.prototype.fileContents = async function (
  expected /*: { [path: string]: string } */
) {
  const dir /*: ContextDir */ = this.obj
  const actual /*: { [path: string]: string } */ = {}

  for (let relpath of _.keys(expected)) {
    try {
      actual[relpath] = await dir.readFile(relpath)
    } catch (err) {
      actual[relpath] = `<Error: ${err.message}>`
    }
  }

  should(actual).deepEqual(expected)
}
