/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: {
    stopped: 'Does not work with AtomWatcher yet.'
  },
  init: [
    { ino: 1, path: 'a/' },
    { ino: 2, path: 'a/file.txt', content: 'initial file content' },
    { ino: 3, path: 'a/subdir/' },
    { ino: 4, path: 'a/subdir/child.txt', content: 'initial child content' }
  ],
  actions: [
    { type: 'mv', src: 'a', dst: 'b' },
    { type: 'wait', ms: 500 },
    { type: 'mkdir', path: 'a' },
    { type: 'create_file', path: 'a/file.txt', content: 'new file content' },
    { type: 'mkdir', path: 'a/subdir' },
    {
      type: 'create_file',
      path: 'a/subdir/child.txt',
      content: 'new child content'
    }
  ],
  expected: {
    tree: [
      'a/',
      'a/file.txt',
      'a/subdir/',
      'a/subdir/child.txt',
      'b/',
      'b/file.txt',
      'b/subdir/',
      'b/subdir/child.txt'
    ],
    trash: [],
    contents: {
      'a/file.txt': 'new file content',
      'a/subdir/child.txt': 'new child content',
      'b/file.txt': 'initial file content',
      'b/subdir/child.txt': 'initial child content'
    }
  }
} /*: Scenario */)
