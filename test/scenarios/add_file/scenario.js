/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  actions: [
    {type: '>', path: 'file'}
  ],
  expected: {
    prepCalls: [
      {method: 'addFileAsync', path: 'file'}
    ],
    tree: [
      'file'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
