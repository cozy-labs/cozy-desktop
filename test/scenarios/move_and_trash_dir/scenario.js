/* @flow */

const { runWithStoppedClient } = require('../../support/helpers/scenarios')

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/subdir/' },
    { ino: 4, path: 'src/subdir/file' }
  ],
  actions: [
    { type: 'mv', src: 'src/subdir', dst: 'dst/subdir' },
    { type: 'wait', ms: 1500 },
    { type: 'trash', path: 'dst/subdir' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: ['dst/', 'src/'],
    remoteTrash:
      process.platform !== 'darwin' && runWithStoppedClient()
        ? // XXX: subdir is trashed first so it's not empty at that point and thus
          // is not erased except on macOS where the local sorting algorithm puts
          // the file trashing first.
          ['subdir/', 'subdir/file']
        : // XXX: file is trashed before subdir which is then empty and thus
          // completely erased.
          ['file'],
    localTrash: ['subdir/', 'subdir/file']
  }
} /*: Scenario */)
