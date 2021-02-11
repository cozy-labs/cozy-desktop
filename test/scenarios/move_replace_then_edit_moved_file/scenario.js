/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/file', content: 'initial content' }
  ],
  actions: [
    { type: 'mv', src: 'src/file', dst: 'dst/file' },
    { type: 'wait', ms: 500 },
    { type: 'create_file', path: 'src/file', content: 'new content' },
    { type: 'wait', ms: 500 },
    { type: 'update_file', path: 'dst/file', content: 'updated content' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: ['dst/', 'dst/file', 'src/', 'src/file'],
    trash: [],
    contents: {
      'dst/file': 'updated content',
      'src/file': 'new content'
    }
  }
} /*: Scenario */)
