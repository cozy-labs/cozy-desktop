/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: {
    stopped: 'Does not work with AtomWatcher yet.'
  },
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'dst/file' },
    { ino: 3, path: 'src/' },
    { ino: 4, path: 'src/file', content: 'src-content' }
  ],
  actions: [
    // Trashing is not needed when running the scenario on the local side, but
    // it is needed when running on the remote side to prevent 409 errors.
    { type: 'trash', path: 'dst/file' },
    { type: 'mv', src: 'src/file', dst: 'dst/file' }
  ],
  expected: {
    tree: ['dst/', 'dst/file', 'src/'],
    remoteTrash: ['file'],
    contents: {
      'dst/file': 'src-content'
    }
  }
} /*: Scenario */)
