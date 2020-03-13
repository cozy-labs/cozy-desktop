/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 2, path: 'parent/src/' },
    { ino: 3, path: 'parent/src/dir/' },
    { ino: 4, path: 'parent/src/dir/empty-subdir/' },
    { ino: 5, path: 'parent/src/dir/subdir/' },
    { ino: 6, path: 'parent/src/dir/subdir/file' }
  ],
  actions: [
    { type: 'mv', src: 'parent/src', dst: 'parent/dst' },
    { type: 'mv', src: 'parent/dst/dir', dst: 'parent/dst/dir2' },
    {
      type: 'mv',
      src: 'parent/dst/dir2/subdir/file',
      dst: 'parent/dst/dir2/subdir/file2'
    }
  ],
  expected: {
    tree: [
      'parent/',
      'parent/dst/',
      'parent/dst/dir2/',
      'parent/dst/dir2/empty-subdir/',
      'parent/dst/dir2/subdir/',
      'parent/dst/dir2/subdir/file2'
    ],
    trash: []
  }
} /*: Scenario */)
