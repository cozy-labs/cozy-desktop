/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/dir1/' }
  ],
  actions: [
    { type: 'mv', src: 'src/dir1', dst: 'dst/dir1' },
    { type: 'mkdir', path: 'dst/dir1/dir2' }
  ],
  expected: {
    tree: ['dst/', 'dst/dir1/', 'dst/dir1/dir2/', 'src/'],
    trash: []
  }
} /*: Scenario */)
