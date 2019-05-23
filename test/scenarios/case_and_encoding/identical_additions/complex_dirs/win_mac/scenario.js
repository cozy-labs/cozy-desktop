/* @flow */

/*:: import type { Scenario } from '../../../..' */

module.exports = ({
  platforms: ['win32', 'darwin'],
  disabled: 'It still fails on Windows and/or macOS',
  actions: require('../actions'),
  expected: {
    tree: [
      'JOHN/',
      'JOHN/exact-same-subdir/',
      'JOHN/exact-same-subdir/a.txt',
      'JOHN/exact-same-subdir/b.txt',
      'JOHN/other-subdir-JOHN-1/',
      'john-conflict.../',
      'john-conflict.../exact-same-subdir/',
      'john-conflict.../exact-same-subdir/a.txt',
      'john-conflict.../exact-same-subdir/b.txt',
      'john-conflict.../other-subdir-john-2/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
