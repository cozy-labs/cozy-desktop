/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'a/'},
    {ino: 2, path: 'a/empty-subdir-a/'},
    {ino: 3, path: 'a/file'},
    {ino: 4, path: 'a/file-a'},
    {ino: 5, path: 'a/subdir-a/'},
    {ino: 6, path: 'a/subdir-a/subfile-a-a'},
    {ino: 7, path: 'a/subdir/'},
    {ino: 8, path: 'a/subdir/subfile'},
    {ino: 9, path: 'a/subdir/subfile-a'},
    {ino: 10, path: 'b/'},
    {ino: 11, path: 'b/empty-subdir-b/'},
    {ino: 12, path: 'b/file'},
    {ino: 13, path: 'b/file-b'},
    {ino: 14, path: 'b/subdir-b/'},
    {ino: 15, path: 'b/subdir-b/subfile-b-b'},
    {ino: 16, path: 'b/subdir/'},
    {ino: 17, path: 'b/subdir/subfile'},
    {ino: 18, path: 'b/subdir/subfile-b'}
  ],
  actions: [
    {type: 'mv', src: 'a', dst: 'c'},
    {type: 'wait', ms: 1500},
    {type: 'mv', src: 'b', dst: 'a'}
  ],
  expected: {
    tree: [
      'a/',
      'a/empty-subdir-b/',
      'a/file',
      'a/file-b',
      'a/subdir-b/',
      'a/subdir-b/subfile-b-b',
      'a/subdir/',
      'a/subdir/subfile',
      'a/subdir/subfile-b',
      'c/',
      'c/empty-subdir-a/',
      'c/file',
      'c/file-a',
      'c/subdir-a/',
      'c/subdir-a/subfile-a-a',
      'c/subdir/',
      'c/subdir/subfile',
      'c/subdir/subfile-a'
    ]
  }
} /*: Scenario */)
