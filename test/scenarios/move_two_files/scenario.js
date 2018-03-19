/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'src/'},
    {ino: 2, path: 'src/file1'},
    {ino: 3, path: 'src/file2'},
    {ino: 4, path: 'dst/'}
  ],
  actions: [
    {type: 'mv', src: 'src/file1', dst: 'dst/file1'},
    {type: 'wait', ms: 1500},
    {type: 'mv', src: 'src/file2', dst: 'dst/file2'}
  ],
  expected: {
    prepCalls: [
      {method: 'moveFileAsync', src: 'src/file1', dst: 'dst/file1'},
      {method: 'moveFileAsync', src: 'src/file2', dst: 'dst/file2'}
    ],
    tree: [
      'dst/',
      'dst/file1',
      'dst/file2',
      'src/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
