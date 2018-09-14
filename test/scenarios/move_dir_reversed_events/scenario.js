/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'dst/'},
    {ino: 2, path: 'src/'},
    {ino: 3, path: 'src/dir/'}
  ],
  actions: [
    {type: 'mv', src: 'src/dir', dst: 'dst/dir'}
  ],
  expected: {
    prepCalls: [
      {method: 'moveFolderAsync', dst: 'dst/dir', src: 'src/dir'}
    ],
    tree: [
      'dst/',
      'dst/dir/',
      'src/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
