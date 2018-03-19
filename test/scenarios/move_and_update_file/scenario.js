/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'dst/'},
    {ino: 2, path: 'src/'},
    {ino: 3, path: 'src/file'}
  ],
  actions: [
    {type: 'mv', src: 'src/file', dst: 'dst/file'},
    {type: 'wait', ms: 1500},
    {type: '>>', path: 'dst/file'}
  ],
  expected: {
    prepCalls: [
      {method: 'moveFileAsync', src: 'src/file', dst: 'dst/file'},
      {method: 'updateFileAsync', path: 'dst/file'}
    ],
    tree: [
      'dst/',
      'dst/file',
      'src/'
    ],
    contents: {
      'dst/file': 'foo blah'
    }
  }
} /*: Scenario */)
