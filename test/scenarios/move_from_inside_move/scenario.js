/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 2, path: 'parent/dst/' },
    { ino: 3, path: 'parent/dst2/' },
    { ino: 4, path: 'parent/src/' },
    { ino: 5, path: 'parent/src/dir/' },
    { ino: 6, path: 'parent/src/dir/empty-subdir/' },
    { ino: 7, path: 'parent/src/dir/subdir/' },
    { ino: 8, path: 'parent/src/dir/subdir/file' }
  ],
  actions: [
    {type: 'mv', src: 'parent/src/dir', dst: 'parent/dst/dir'},
    {type: 'mv', src: 'parent/dst/dir/subdir', dst: 'parent/dst2/subdir'}
  ],
  expected: {
    prepCalls: [
      {method: 'moveFolderAsync', dst: 'parent/dst2/subdir', src: 'parent/src/dir/subdir'},
      {method: 'moveFolderAsync', dst: 'parent/dst/dir', src: 'parent/src/dir'}
    ],
    tree: [
      'parent/',
      'parent/dst/',
      'parent/dst/dir/',
      'parent/dst/dir/empty-subdir/',
      'parent/dst2/',
      'parent/dst2/subdir/',
      'parent/dst2/subdir/file',
      'parent/src/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
