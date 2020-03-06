/* @flow */

/*:: import type { Scenario } from '../..' */

module.exports = ({
  side: 'local',
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'dst/file' },
    { ino: 3, path: 'src/' },
    { ino: 4, path: 'src/file', content: 'src-content' }
  ],
  actions: [{ type: 'mv', src: 'src/file', dst: 'dst/file' }],
  expected: {
    tree: ['dst/', 'dst/file', 'src/'],
    remoteTrash: ['file'],
    contents: {
      'dst/file': 'src-content'
    }
  }
} /*: Scenario */)
