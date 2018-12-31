/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'file' }
  ],
  actions: [
    {type: 'update_file', path: 'file'}
  ],
  expected: {
    tree: [
      'file'
    ],
    remoteTrash: [],
    contents: {
      'file': 'foo blah'
    }
  }
} /*: Scenario */)
