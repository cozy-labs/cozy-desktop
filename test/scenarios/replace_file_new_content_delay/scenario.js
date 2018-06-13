/* @flow */

import type { Scenario } from '..'

module.exports = ({
  init: [
    {ino: 1, path: 'foo', content: 'foo'}
  ],
  actions: [
    {type: 'delete', path: 'foo'},
    {type: 'wait', ms: 1000},
    {type: '>', path: 'foo', content: 'bar'}
  ],
  expected: {
    prepCalls: [
      {method: 'updateFileAsync', path: 'foo'}
    ],
    tree: [
      'foo'
    ],
    contents: {
      'foo': 'bar'
    },
    remoteTrash: [
    ]
  }
}: Scenario)
