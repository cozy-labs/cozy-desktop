/* @flow */

/*:: import type { Scenario } from '../../../..' */

module.exports = ({
  platforms: ['linux'],
  actions: require('../actions'),
  expected: {
    tree: [
      'JOHN/',
      'JOHN/exact-same-subdir/',
      'JOHN/exact-same-subdir/a.txt',
      'JOHN/exact-same-subdir/b.txt',
      'JOHN/other-subdir-JOHN-1/',
      'john/',
      'john/exact-same-subdir/',
      'john/exact-same-subdir/a.txt',
      'john/exact-same-subdir/b.txt',
      'john/other-subdir-john-2/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
