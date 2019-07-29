/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: {
    'atom/linux': 'Does not work with AtomWatcher yet.',
    'local/darwin': 'Does not work with all flush points',
    stopped: 'Does not work with AtomWatcher yet.'
  },
  side: 'local',
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/dir/' },
    { ino: 4, path: 'src/dir/subfile' }
  ],
  actions: [
    { type: 'mv', src: 'src/dir', dst: 'dst/dir' },
    { type: 'wait', ms: 1500 },
    { type: 'trash', path: 'dst/dir/subfile' }
  ],
  expected: {
    tree: ['dst/', 'dst/dir/', 'src/'],
    remoteTrash: ['subfile']
  }
} /*: Scenario */)
