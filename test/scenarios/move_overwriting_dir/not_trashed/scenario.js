/* @flow */

/*:: import type { Scenario } from '../..' */

module.exports = ({
  side: 'local',
  useCaptures: false,
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'dst/dir/' },
    { ino: 3, path: 'dst/dir/subdir/' },
    { ino: 4, path: 'dst/dir/deletedFile', content: 'should be kept' },
    { ino: 5, path: 'dst/dir/file', content: 'overwritten' },
    { ino: 6, path: 'dst/dir/file3', content: 'not-overwritten' },
    { ino: 7, path: 'dst/dir/subdir/file', content: 'sub-overwritten' },
    { ino: 8, path: 'dst/dir/subdir/file5', content: 'sub-not-overwritten' },
    { ino: 9, path: 'src/' },
    { ino: 10, path: 'src/dir/' },
    { ino: 11, path: 'src/dir/subdir/' },
    { ino: 12, path: 'src/dir/deletedFile', content: 'should be deleted' },
    { ino: 13, path: 'src/dir/file', content: 'overwriter' },
    { ino: 14, path: 'src/dir/subdir/file', content: 'sub-overwriter' },
    { ino: 15, path: 'src/dir/subdir/file6', content: 'sub-other' },
    { ino: 16, path: 'src/dir/file2', content: 'other' },
    { ino: 17, path: 'src/dir/subdir/subsub/' }
  ],
  actions: [
    { type: 'delete', path: 'src/dir/deletedFile' },
    { type: 'mv', merge: true, src: 'src/dir', dst: 'dst/dir' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: [
      'dst/',
      'dst/dir/',
      'dst/dir/deletedFile',
      'dst/dir/file',
      'dst/dir/file2',
      'dst/dir/file3',
      'dst/dir/subdir/',
      'dst/dir/subdir/file',
      'dst/dir/subdir/file5',
      'dst/dir/subdir/file6',
      'dst/dir/subdir/subsub/',
      'src/'
    ],
    localTrash: [
      // Why isn't the hierarchy preserved in the local trash on Windows?
      'dir/',
      'dir/deletedFile',
      'dir/subdir/',
      'file',
      'file (__cozy__: ...)'
    ],
    remoteTrash:
      process.platform === 'win32'
        ? [
            'dir/',
            'dir/deletedFile',
            'dir/file',
            'dir/subdir/',
            'dir/subdir/file'
          ]
        : [
            // Since we're merging here, on Linux and macOs, the destination
            // directories are kept while the source ones are trashed as
            // initialDiff won't find them.
            // On Windows though, the destination directories are deleted before
            // the source ones are moved so the hierarchy of the deleted
            // directories is preserved.
            'dir/',
            'dir/deletedFile',
            'dir/subdir/',
            'file',
            'file (__cozy__: ...)'
          ],
    contents: {
      'dst/dir/deletedFile': 'should be kept',
      'dst/dir/file': 'overwriter',
      'dst/dir/subdir/file': 'sub-overwriter'
    }
  }
} /*: Scenario */)
