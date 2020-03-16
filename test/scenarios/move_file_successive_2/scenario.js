/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'dst1/' },
    { ino: 2, path: 'dst2/' },
    { ino: 3, path: 'src/' },
    { ino: 4, path: 'src/file' }
  ],
  actions: [
    { type: 'mv', src: 'src/file', dst: 'dst1/file' },
    { type: 'wait', ms: 1500 },
    { type: 'mv', src: 'dst1/file', dst: 'dst2/file' }
  ],
  expected: {
    tree: ['dst1/', 'dst2/', 'dst2/file', 'src/'],
    trash: []
  }
} /*: Scenario */)
