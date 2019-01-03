/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'dst/'},
    {ino: 2, path: 'src/'},
    {ino: 3, path: 'src/file', content: 'initial content'}
  ],
  actions: [
    {type: 'mv', src: 'src/file', dst: 'dst/file'},
    {type: 'wait', ms: 1500},
    {type: 'update_file', path: 'dst/file', content: 'updated content'}
  ],
  expected: {
    tree: [
      'dst/',
      'dst/file',
      'src/'
    ],
    contents: {
      'dst/file': 'updated content'
    }
  }
} /*: Scenario */)
