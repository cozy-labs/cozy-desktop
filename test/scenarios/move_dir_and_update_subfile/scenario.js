/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: {
    stopped: 'Broken by a regression on AtomWatcher. To be fixed soon.'
  },
  init: [
    { ino: 1, path: 'src/' },
    { ino: 2, path: 'src/file', content: 'initial content' }
  ],
  actions: [
    { type: 'mv', src: 'src', dst: 'dst' },
    { type: 'wait', ms: 1500 },
    { type: 'update_file', path: 'dst/file', content: 'updated content' }
  ],
  expected: {
    tree: ['dst/', 'dst/file'],
    remoteTrash: [],
    contents: {
      'dst/file': 'updated content'
    }
  }
} /*: Scenario */)
