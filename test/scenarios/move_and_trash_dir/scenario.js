/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: {
    'local/win32-no-trash-events':
      'Trashing events are missing. May be a capture issue...'
  },
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/subdir/' },
    { ino: 4, path: 'src/subdir/file' }
  ],
  actions: [
    { type: 'mv', src: 'src/subdir', dst: 'dst/subdir' },
    { type: 'wait', ms: 1500 },
    { type: 'trash', path: 'dst/subdir' }
  ],
  expected: {
    tree: ['dst/', 'src/']
    // FIXME: file should be trashed with its parent
    // remoteTrash: [
    //   'subdir/',
    //   'subdir/file'
    // ]
  }
} /*: Scenario */)
