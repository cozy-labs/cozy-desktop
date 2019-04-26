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
      'foo'
      // FOO-conflict-.../ will be synced on next polling
    ],
    remoteTree: [
      'FOO-conflict-.../',
      'FOO-conflict-.../subdir/',
      'FOO-conflict-.../subdir/file',
      'foo'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
