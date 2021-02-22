/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [{ ino: 1, path: 'file', content: 'initial content' }],
  actions: [
    { type: 'delete', path: 'file' },
    { type: 'create_file', path: 'file', content: 'new content' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: ['file'],
    trash: [],
    contents: {
      file: 'new content'
    }
  }
} /*: Scenario */)
