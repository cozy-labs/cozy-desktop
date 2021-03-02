/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  side: 'local',
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: '../outside/dir/' },
    { ino: 3, path: '../outside/dir/empty-subdir/' },
    { ino: 4, path: '../outside/dir/subdir/' },
    { ino: 5, path: '../outside/dir/subdir/file', content: 'whatever' }
  ],
  actions: [
    { type: 'mv', src: '../outside/dir', dst: 'dst/dir' },
    { type: 'wait', ms: 3000 } // Wait for all dirs to be scanned so file is found
  ],
  expected: {
    trash: [],
    tree: [
      'dst/',
      'dst/dir/',
      'dst/dir/empty-subdir/',
      'dst/dir/subdir/',
      'dst/dir/subdir/file'
    ],
    contents: {
      'dst/dir/subdir/file': 'whatever'
    }
  }
} /*: Scenario */)
