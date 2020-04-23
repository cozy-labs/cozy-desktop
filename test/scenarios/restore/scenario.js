/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  side: 'remote',
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 2, path: 'parent/dir/', trashed: true },
    { ino: 3, path: 'parent/dir/empty-subdir/', trashed: true },
    { ino: 4, path: 'parent/dir/subdir/', trashed: true },
    { ino: 5, path: 'parent/dir/subdir/file', trashed: true },
    { ino: 6, path: 'parent/file' },
    { ino: 7, path: 'parent/other_dir/' }
  ],
  actions: [
    { type: 'restore', pathInTrash: 'dir' },
    { type: 'trash', path: 'parent/file' },
    { type: 'restore', pathInTrash: 'file' }
  ],
  expected: {
    tree: [
      'parent/',
      'parent/dir/',
      'parent/dir/empty-subdir/',
      'parent/dir/subdir/',
      'parent/dir/subdir/file',
      'parent/file',
      'parent/other_dir/'
    ],
    trash: []
  }
} /*: Scenario */)
