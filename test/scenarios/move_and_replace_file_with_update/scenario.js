/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/file1', content: 'overwriting content' },
    { ino: 4, path: 'dst/file1', content: 'overwritten content' },
    { ino: 3, path: 'src/file2', content: 'initial content' },
    { ino: 4, path: 'dst/file2', content: 'overwritten content' }
  ],
  actions: [
    { type: 'update_file', path: 'dst/file1', content: 'updated content' },
    { type: 'mv', src: 'src/file2', dst: 'dst/file2' },
    { type: 'wait', ms: 500 },
    { type: 'update_file', path: 'dst/file2', content: 'updated content' },
    { type: 'mv', src: 'src/file1', dst: 'dst/file1' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: ['dst/', 'dst/file1', 'dst/file2', 'src/'],
    trash: ['file1', 'file2'],
    contents: {
      'dst/file1': 'overwriting content',
      'dst/file2': 'updated content'
    }
  }
} /*: Scenario */)
