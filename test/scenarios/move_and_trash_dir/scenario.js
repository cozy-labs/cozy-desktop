/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/subdir/' },
    { ino: 4, path: 'src/subdir/file' }
  ],
  actions: [
    { type: 'mv', src: 'src/subdir', dst: 'dst/subdir' },
    { type: 'wait', ms: 1500 },
    { type: 'trash', path: 'dst/subdir' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: ['dst/', 'src/'],
    trash: ['subdir/', 'subdir/file']
  }
} /*: Scenario */)
