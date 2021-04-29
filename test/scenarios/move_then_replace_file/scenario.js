/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  side: 'remote',
  useCaptures: false,
  init: [{ ino: 1, path: 'file.ods', content: 'initial content' }],
  actions: [
    { type: 'mv', src: 'file.ods', dst: 'other-file.ods' },
    { type: 'create_file', path: 'file.ods', content: 'new content' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: ['file.ods', 'other-file.ods'],
    trash: [],
    contents: {
      'file.ods': 'new content',
      'other-file.ods': 'initial content'
    }
  }
} /*: Scenario */)
