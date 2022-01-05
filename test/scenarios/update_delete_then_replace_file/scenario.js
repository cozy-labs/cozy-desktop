/* @flow */

const {
  runOnHFS,
  runWithStoppedClient
} = require('../../support/helpers/scenarios')

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  disabled:
    process.platform === 'linux' && runWithStoppedClient()
      ? 'Does not work because inodes are reused and the initial diff misinterprets some changes as moves'
      : undefined,
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'dst/file2', content: 'final content' },
    { ino: 3, path: 'final/' },
    { ino: 4, path: 'final/file2', content: 'replaced content' },
    { ino: 5, path: 'src/' },
    { ino: 6, path: 'src/file1', content: 'initial content' },
    { ino: 7, path: 'src/file2', content: 'moved content' }
  ],
  actions: [
    { type: 'wait', ms: runOnHFS() ? 1000 : 0 },
    { type: 'update_file', path: 'src/file1', content: 'updated content' },
    { type: 'mv', src: 'src/file2', dst: 'final/file2' },
    { type: 'wait', ms: 500 },
    { type: 'delete', path: 'src/file1' },
    { type: 'delete', path: 'final/file2' },
    { type: 'wait', ms: 500 },
    { type: 'create_file', path: 'src/file1', content: 'final content' },
    { type: 'create_file', path: 'final/file2', content: 'replacing content' },
    { type: 'wait', ms: 500 },
    { type: 'mv', src: 'dst/file2', dst: 'final/file2' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: ['dst/', 'final/', 'final/file2', 'src/', 'src/file1'],
    remoteTrash: [
      'file2', // src/file2
      'file2 (...)' // final/file2
    ],
    localTrash: [
      'file2' // src/file2
      // final/file2 is overwritten by the last move without being sent to the
      // trash first since it's not necessary to do so on the local filesystem.
    ],
    contents: {
      'src/file1': 'final content',
      'final/file2': 'final content'
    }
  }
} /*: Scenario */)
