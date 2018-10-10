/* eslint-disable no-multi-spaces */
/* @flow */

/*:: import type { Scenario } from '../../../..' */

module.exports = ({
  platforms: ['linux'],
  actions: [
    {type: 'mkdir', path: 'FOO'},
    {type: 'mkdir', path: 'FOO/subdir'},
    {type: '>',     path: 'FOO/subdir/file'},
    {type: '>',     path: 'foo'}
  ],
  expected: {
    tree: [
      'FOO/',
      'FOO/subdir/',
      'FOO/subdir/file',
      'foo'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
