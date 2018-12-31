/* @flow */

/*:: import type { Scenario } from '..' */

// FIXME: https://trello.com/c/txhkekhw
module.exports = ({
  side: 'remote',
  init: [
    {ino: 1, path: 'src/'},
    {ino: 2, path: 'src/file'}
  ],
  actions: [
    {type: 'mv', src: 'src', dst: 'dst'},
    {type: 'update_file', path: 'dst/file'}
  ],
  expected: {
    tree: [
      'dst/',
      'dst/file'
    ],
    remoteTrash: [],
    contents: {
      'dst/file': 'foo blah'
    }
  }
} /*: Scenario */)
