/* @flow */

const { runWithStoppedClient } = require('../../../support/helpers/scenarios')

/*:: import type { Scenario } from '../..' */

module.exports = ({
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'dst/dir/' },
    { ino: 3, path: 'dst/dir/subdir/' },
    { ino: 4, path: 'dst/dir/file', content: 'overwritten' },
    { ino: 5, path: 'dst/dir/file3', content: 'not-overwritten' },
    { ino: 6, path: 'dst/dir/subdir/file', content: 'sub-overwritten' },
    { ino: 7, path: 'dst/dir/subdir/file5', content: 'sub-not-overwritten' },
    { ino: 8, path: 'src/' },
    { ino: 9, path: 'src/dir/' },
    { ino: 10, path: 'src/dir/subdir/' },
    { ino: 11, path: 'src/dir/file', content: 'overwriter' },
    { ino: 12, path: 'src/dir/subdir/file', content: 'sub-overwriter' },
    { ino: 13, path: 'src/dir/subdir/file6', content: 'sub-other' },
    { ino: 14, path: 'src/dir/file2', content: 'other' },
    { ino: 15, path: 'src/dir/subdir/subsub/' }
  ],
  actions: [{ type: 'mv', force: true, src: 'src/dir', dst: 'dst/dir' }],
  expected: {
    tree: [
      'dst/',
      'dst/dir/',
      'dst/dir/file',
      'dst/dir/file2',
      'dst/dir/subdir/',
      'dst/dir/subdir/file',
      'dst/dir/subdir/file6',
      'dst/dir/subdir/subsub/',
      'src/'
    ],
    // When the overwrite happens while the client is turned off, we won't detect
    // the files' deletion before the folder's movement so we won't trash them
    // by themselves and will thus be trashed as part of the folder hierarchy.
    trash: runWithStoppedClient()
      ? [
          'dir/',
          'dir/file',
          'dir/file3',
          'dir/subdir/',
          'dir/subdir/file',
          'dir/subdir/file5'
        ]
      : [
          'dir/',
          'dir/file',
          'dir/subdir/',
          'dir/subdir/file',
          'file3', // With breakpoint 7 on darwin, this is inside the parent folder
          'file5' // With breakpoint 7 on darwin, this is inside the parent folder
        ],
    contents: {
      'dst/dir/file': 'overwriter',
      'dst/dir/subdir/file': 'sub-overwriter'
    }
  }
} /*: Scenario */)
