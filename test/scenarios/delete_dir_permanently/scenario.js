/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled:
    "Not sure why we don't handle this one... Maybe because the whole tree ends up at the root of the Cozy trash?",
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 2, path: 'parent/dir/' },
    { ino: 3, path: 'parent/dir/empty-subdir/' },
    { ino: 4, path: 'parent/dir/subdir/' },
    { ino: 5, path: 'parent/dir/subdir/file' },
    { ino: 6, path: 'parent/other_dir/' }
  ],
  actions: [{ type: 'delete', path: 'parent/dir' }],
  expected: {
    tree: ['parent/', 'parent/other_dir/'],
    remoteTrash: [
      'file'
      // TODO: Trash with ancestor dir:
      // 'dir/',
      // 'dir/empty-subdir/',
      // 'dir/subdir/',
      // 'dir/subdir/file'
    ]
  }
} /*: Scenario */)
