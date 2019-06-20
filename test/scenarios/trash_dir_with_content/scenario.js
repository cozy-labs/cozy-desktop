/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 2, path: 'parent/dir/' },
    { ino: 3, path: 'parent/dir/empty-subdir/' },
    { ino: 4, path: 'parent/dir/subdir/' },
    { ino: 5, path: 'parent/dir/subdir/file' },
    { ino: 6, path: 'parent/other_dir/' }
  ],
  disabled: {
    stopped:
      'Remote trash content is ok on initial scan & ko on live change. ' +
      'Disable the initial scan scenario until we fix the live case.'
  },
  actions: [{ type: 'trash', path: 'parent/dir' }],
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
