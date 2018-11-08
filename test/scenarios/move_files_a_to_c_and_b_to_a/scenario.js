/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    {ino: 1, path: 'a', content: 'content a'},
    {ino: 2, path: 'b', content: 'content b'}
  ],
  actions: [
    {type: 'mv', src: 'a', dst: 'c'},
    {type: 'wait', ms: 1500},
    {type: 'mv', src: 'b', dst: 'a'}
  ],
  expected: {
    tree: [
      'a',
      'c'
    ],
    contents: {
      'a': 'content b',
      'c': 'content a'
    },
    remoteTrash: []
  }
} /*: Scenario */)
