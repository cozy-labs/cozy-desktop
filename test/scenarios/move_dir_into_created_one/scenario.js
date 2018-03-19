/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'dir1/'}
  ],
  actions: [
    {type: 'mkdir', path: 'dir2'},
    {type: 'mv', src: 'dir1', dst: 'dir2/dir1'}
  ],
  expected: {
    prepCalls: [
      {method: 'putFolderAsync', path: 'dir2'},
      {method: 'moveFolderAsync', src: 'dir1', dst: 'dir2/dir1'}
    ],
    tree: [
      'dir2/',
      'dir2/dir1/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
