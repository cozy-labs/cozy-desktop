/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [{ ino: 1, path: 'src/' }, { ino: 2, path: 'src/file' }],
  actions: [
    { type: 'mv', src: 'src/file', dst: 'file' },
    { type: 'wait', ms: 1500 },
    { type: 'trash', path: 'src' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: ['file'],
    localTrash: ['src/'],
    remoteTrash: [] // XXX: the empty folder is removed from the trash
  }
} /*: Scenario */)
