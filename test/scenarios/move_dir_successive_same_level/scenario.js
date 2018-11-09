/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 2, path: 'parent/dst1/' },
    { ino: 3, path: 'parent/dst2/' },
    { ino: 4, path: 'parent/src/' },
    { ino: 5, path: 'parent/src/dir/' },
    { ino: 6, path: 'parent/src/dir/empty-subdir/' },
    { ino: 7, path: 'parent/src/dir/subdir/' },
    { ino: 8, path: 'parent/src/dir/subdir/file' }
  ],
  actions: [
    {type: 'mv', src: 'parent/src/dir', dst: 'parent/dst1/dir'},
    {type: 'mv', src: 'parent/dst1/dir', dst: 'parent/dst2/dir'}
  ],
  // FIXME: eventsBreakpoints: [0, 1, 5],
  expected: {
    tree: [
      'parent/',
      'parent/dst1/',
      'parent/dst2/',
      'parent/dst2/dir/',
      'parent/dst2/dir/empty-subdir/',
      'parent/dst2/dir/subdir/',
      'parent/dst2/dir/subdir/file',
      'parent/src/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
