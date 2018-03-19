/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  actions: [
    {type: 'mkdir', path: 'foo'},
    {type: 'mkdir', path: 'foo/bar'}
  ],
  expected: {
    prepCalls: [
      {method: 'putFolderAsync', path: 'foo'},
      {method: 'putFolderAsync', path: 'foo/bar'}
    ],
    tree: [
      'foo/',
      'foo/bar/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
