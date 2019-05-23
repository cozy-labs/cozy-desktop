/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  side: 'remote',
  disabled:
    "Not sure why we don't handle this case yet. At least because of init trashed property.",
  init: [
    { ino: 1, path: 'parent/' },
    // FIXME: For some reason, this line had `trashed: true`.
    // But `trashed` is not part of the `Scenario` type.
    // Keeping it commented so we remember about it when working to make this
    // scenario pass and figure about what to do about it.
    { ino: 2, path: 'parent/dir/' /*, trashed: true */ }, // eslint-disable-line
    { ino: 3, path: 'parent/dir/empty-subdir/' },
    { ino: 4, path: 'parent/dir/subdir/' },
    { ino: 5, path: 'parent/dir/subdir/file' },
    { ino: 6, path: 'parent/file' },
    { ino: 7, path: 'parent/other_dir/' }
  ],
  actions: [{ type: 'restore', pathInTrash: 'dir' }],
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
    remoteTrash: []
  }
} /*: Scenario */)
