/* @flow */

/*::
import type { Scenario } from '..'
*/

module.exports = ({
  init: [
    { ino: 1, path: 'file' }
  ],
  actions: [
    {type: 'delete', path: 'file'},
    {type: 'wait', ms: 1000},
    {type: '>', path: 'file'}
  ],
  expected: {
    prepCalls: [
      {method: 'trashFileAsync', path: 'file'},
      {method: 'addFileAsync', path: 'file'}
    ],
    tree: [
      'file'
    ],
    remoteTrash: [
      'file'
    ]
  }
} /*: Scenario */)
