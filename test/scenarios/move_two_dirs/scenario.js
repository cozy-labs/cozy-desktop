/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'src/' },
    { ino: 2, path: 'src/dir1/' },
    { ino: 3, path: 'src/dir2/' },
    { ino: 4, path: 'dst/' }
  ],
  actions: [
    { type: 'mv', src: 'src/dir1', dst: 'dst/dir1' },
    { type: 'wait', ms: 1500 },
    { type: 'mv', src: 'src/dir2', dst: 'dst/dir2' }
  ],
  expected: {
    tree: ['dst/', 'dst/dir1/', 'dst/dir2/', 'src/'],
    remoteTrash: []
  }
} /*: Scenario */)
