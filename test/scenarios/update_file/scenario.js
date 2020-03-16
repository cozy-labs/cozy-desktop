/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [{ ino: 1, path: 'file', content: 'initial content' }],
  actions: [{ type: 'update_file', path: 'file', content: 'new content' }],
  expected: {
    tree: ['file'],
    trash: [],
    contents: {
      file: 'new content'
    }
  }
} /*: Scenario */)
