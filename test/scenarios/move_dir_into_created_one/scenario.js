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
    tree: [
      'dir2/',
      'dir2/dir1/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
