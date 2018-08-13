/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  actions: [
    {type: 'mkdir', path: '_dir'},
    {type: '>', path: '_file'}
  ],
  expected: {
    prepCalls: [
      {method: 'putFolderAsync', path: '_dir'},
      {method: 'addFileAsync', path: '_file'}
    ],
    tree: [
      '_dir/',
      '_file'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
