/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'dst/file' },
    { ino: 3, path: 'src/' },
    { ino: 4, path: 'src/file' }
  ],
  // @TODO try to add a mv -f and use it.
  actions: [
    {type: 'trash', path: 'dst/file'},
    {type: 'mv', src: 'src/file', dst: 'dst/file'}
  ],
  expected: {
    prepCalls: [
      {method: 'trashFileAsync', path: 'dst/file'},
      {method: 'moveFileAsync', dst: 'dst/file', src: 'src/file'}
    ],
    tree: [
      'dst/',
      'dst/file',
      'src/'
    ],
    remoteTrash: [
      'file'
    ]
  }
} /*: Scenario */)
