/* eslint-disable no-multi-spaces */
/* @flow */

/*:: import type { Scenario } from '../../../..' */

module.exports = ({
  // FIXME: Breaks Travis macOS but passes on local macOS
  platforms: ['win32'],
  side: 'remote',
  actions: [
    { type: 'mkdir', path: 'FOO' },
    { type: 'mkdir', path: 'FOO/subdir' },
    { type: 'create_file', path: 'FOO/subdir/file' },
    { type: 'create_file', path: 'foo' }
  ],
  expected: {
    localTree: [
      'FOO/',
      'FOO/subdir/',
      'FOO/subdir/file'
      // foo-conflict-.../ will be synced on next polling
    ],
    remoteTree: ['FOO/', 'FOO/subdir/', 'FOO/subdir/file', 'foo-conflict-...'],
    trash: []
  }
} /*: Scenario */)
