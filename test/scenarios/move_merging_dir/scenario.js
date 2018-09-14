/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  side: 'local',
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
    { ino: 14, path: 'src/dir/file2', content: 'other' }
  ],
  actions: [
    {type: 'mv', merge: true, src: 'src/dir', dst: 'dst/dir'}
  ],
  expected: {
    prepCalls: [
      {method: 'trashFileAsync', path: 'dst/dir/file'},
      {method: 'trashFolderAsync', path: 'dst/dir'},
      {method: 'moveFileAsync', dst: 'dst/dir/file', src: 'src/dir/file'},
      {method: 'moveFileAsync', dst: 'dst/dir/file2', src: 'src/dir/file2'},
      {method: 'moveFileAsync', dst: 'dst/dir/subdir/file6', src: 'src/dir/subdir/file6'}
    ],
    tree: [
      'dst/',
      'dst/dir/',
      'dst/dir/file',
      'dst/dir/file2',
      'dst/dir/file3',
      'dst/dir/subdir/',
      'dst/dir/subdir/file',
      'dst/dir/subdir/file5',
      'dst/dir/subdir/file6',
      'src/'
    ],
    // remoteTrash: [
    //   'file',
    //   'file (__cozy__:'
    // ],
    contents: {
      'dst/dir/file': 'overwriter',
      'dst/dir/subdir/file': 'sub-overwriter'
    }
  }
} /*: Scenario */)
