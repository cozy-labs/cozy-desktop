/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'src/'},
    {ino: 2, path: 'src/A'}
  ],
  actions: [
    {type: 'mv', src: 'src/A', dst: 'src/B'},
    {type: 'wait', ms: 1500},
    {type: 'mv', src: 'src/B', dst: 'src/C'},
    {type: 'wait', ms: 1500},
    {type: 'mv', src: 'src/C', dst: 'src/B'},
    {type: 'wait', ms: 1500}
  ],
  expected: {
    tree: [
      'src/',
      'src/B'
    ],
    contents: {
      'src/B': 'foo'
    }
  }
} /*: Scenario */)
