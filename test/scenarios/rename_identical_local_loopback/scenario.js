/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  // FIXME: fails on darwin because cozy-stack uses case-insensitive APFS
  platforms: ['win32', 'darwin'],
  side: 'local',
  init: [
    {ino: 1, path: 'DIR_CASE/'}
  ],
  actions: [
    // No action, we're just simulating FS events after syncing remote to local.
  ],
  expected: {
    tree: [
      'DIR_CASE/'
    ],
    remoteTrash: []
  }
} /*: Scenario */)
