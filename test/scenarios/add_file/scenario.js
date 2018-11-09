/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  actions: [
    {type: '>', path: 'file'}
  ],
  expected: {
    tree: [
      'file'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
