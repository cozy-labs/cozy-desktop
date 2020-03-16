/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: 'requires handling moveFrom + trashed', // FIXME
  useCaptures: false,
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/file' }
  ],
  actions: [
    { type: 'mv', src: 'src/file', dst: 'dst/file' },
    { type: 'wait', ms: 1500 },
    { type: 'trash', path: 'dst/file' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: ['dst/', 'src/'],
    trash: ['file']
  }
} /*: Scenario */)
