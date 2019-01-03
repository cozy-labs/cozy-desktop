/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'file', content: 'initial content'}
  ],
  actions: [
    {type: 'update_file', path: 'file', content: 'updated content'}
  ],
  expected: {
    tree: [
      'file'
    ],
    remoteTrash: [],
    contents: {
      'file': 'updated content'
    }
  }
} /*: Scenario */)
